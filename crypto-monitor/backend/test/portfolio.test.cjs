require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { Logger } = require('@nestjs/common');
const { validateEnvironment } = require('../dist/config/environment');
const { BithumbAuthService } = require('../dist/bithumb/bithumb-auth.service');
const { BithumbRestClient } = require('../dist/bithumb/bithumb-rest.client');
const { mapAccounts, mapQuotes } = require('../dist/bithumb/bithumb-account.mapper');
const { PortfolioCalculator } = require('../dist/portfolio/portfolio.calculator');
const { PortfolioService } = require('../dist/portfolio/portfolio.service');
const { PortfolioGuard } = require('../dist/portfolio/portfolio.guard');
Logger.overrideLogger(false);

const environment = { bithumbAccessKey: 'test-access', bithumbSecretKey: 'test-secret', portfolioApiToken: 't'.repeat(64) };
const options = { timeoutMs: 1000, intervalMs: 0, maxQueueMs: 0 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const status = code => error => error.getStatus() === code;
const account = (currency, available, locked = '0', avgBuyPrice = '0', unitCurrency = 'KRW') =>
  ({ currency, available, locked, avgBuyPrice, unitCurrency, avgBuyPriceModified: false });
const rawAccount = { currency: 'BTC', balance: '0.04', locked: '0.002', avg_buy_price: '90000000', avg_buy_price_modified: false, unit_currency: 'KRW' };
const pricing = (price, market = 'KRW-BTC') => ({ price, markets: [market], timestamps: [new Date('2026-09-23T01:00:00Z')] });
const calc = (accounts, prices = new Map()) => new PortfolioCalculator().calculate(accounts, prices, new Date('2026-09-23T01:00:00Z'));

test('environment accepts API_KEY alias and rejects conflicting aliases without exposing values', () => {
  const base = { DATABASE_URL: 'postgresql://crypto:test@postgres:5432/crypto_monitor', BITHUMB_API_KEY: 'test-access', BITHUMB_SECRET_KEY: 'test-secret' };
  assert.equal(validateEnvironment(base).bithumbAccessKey, 'test-access');
  assert.equal(validateEnvironment({ ...base, BITHUMB_ACCESS_KEY: 'test-access' }).bithumbAccessKey, 'test-access');
  assert.throws(() => validateEnvironment({ ...base, BITHUMB_ACCESS_KEY: 'conflicting-secret' }), error => {
    assert.ok(!error.message.includes('conflicting-secret')); return true;
  });
  assert.throws(() => validateEnvironment({ ...base, PORTFOLIO_API_TOKEN: 'short' }), /PORTFOLIO_API_TOKEN/);
});

test('account JWT matches HS256 contract with a fresh nonce and millisecond timestamp', () => {
  const auth = new BithumbAuthService(environment);
  const start = Date.now();
  const tokens = [auth.createAccountsAuthorization(), auth.createAccountsAuthorization()];
  const payloads = tokens.map(value => {
    assert.ok(value.startsWith('Bearer '));
    const [header, payload, signature] = value.slice(7).split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'HS256', typ: 'JWT' });
    assert.equal(signature, createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url'));
    const data = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.deepEqual(Object.keys(data).sort(), ['access_key', 'nonce', 'timestamp']);
    assert.equal(data.access_key, 'test-access');
    assert.match(data.nonce, /^[0-9a-f-]{36}$/);
    assert.ok(Number.isInteger(data.timestamp) && data.timestamp >= start && data.timestamp <= Date.now());
    return data;
  });
  assert.notEqual(payloads[0].nonce, payloads[1].nonce);
  assert.equal(JSON.stringify(auth), '{}');
  assert.throws(() => new BithumbAuthService({}).createAccountsAuthorization(), status(503));
});

test('account mapper preserves decimal strings, validates types and rejects duplicate currencies', () => {
  assert.deepEqual(mapAccounts([rawAccount]), [account('BTC', '0.04', '0.002', '90000000')]);
  assert.deepEqual(mapAccounts([]), []);
  for (const change of [{ balance: null }, { balance: -1 }, { locked: '-1' }, { avg_buy_price: 'NaN' }, { avg_buy_price_modified: 'false' }, { currency: '../BTC' }]) {
    assert.throws(() => mapAccounts([{ ...rawAccount, ...change }]));
  }
  assert.throws(() => mapAccounts([rawAccount, rawAccount]));
});

test('private auth header is sent only to official GET accounts and never to public endpoints', async () => {
  const calls = [];
  const client = new BithumbRestClient(async (url, init) => {
    calls.push({ url, init });
    return json(url.pathname === '/v1/accounts' ? [rawAccount] : []);
  }, options, new BithumbAuthService(environment));
  await client.getAccounts();
  await client.getMarkets();
  assert.equal(calls[0].url.toString(), 'https://api.bithumb.com/v1/accounts');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.ok(calls[0].init.headers.Authorization.startsWith('Bearer '));
  assert.deepEqual(calls[1].init.headers, { accept: 'application/json' });
});

test('authentication error code whitelist prevents external message and secret disclosure', async () => {
  for (const [name, expected] of [['NotAllowIP', 'BITHUMB_IP_NOT_ALLOWED'], ['out_of_scope', 'BITHUMB_READ_PERMISSION_REQUIRED'], ['secret-token', 'BITHUMB_AUTH_REJECTED']]) {
    const client = new BithumbRestClient(async () => json({ error: { name, message: 'secret-token' } }, 401), options, new BithumbAuthService(environment));
    await assert.rejects(client.getAccounts(), error => {
      assert.equal(error.getStatus(), 503);
      assert.equal(error.getResponse().code, expected);
      assert.ok(!JSON.stringify(error.getResponse()).includes('secret-token'));
      return true;
    });
  }
});

test('batch quotes reject missing, duplicated or mismatched markets and nonpositive prices', () => {
  const row = { market: 'KRW-BTC', trade_price: 100, timestamp: 1790126400000 };
  assert.equal(mapQuotes([row], ['KRW-BTC'])[0].price, 100);
  assert.throws(() => mapQuotes([], ['KRW-BTC']));
  assert.throws(() => mapQuotes([row], ['KRW-ETH']));
  assert.throws(() => mapQuotes([row, row], ['KRW-BTC', 'KRW-ETH']));
  for (const price of [0, -1, NaN, '100']) assert.throws(() => mapQuotes([{ ...row, trade_price: price }], ['KRW-BTC']));
});

test('locked crypto and locked KRW are both included in total, cost, profit and weights', () => {
  const result = calc([account('KRW', '80', '10'), account('BTC', '0.08', '0.02', '80')], new Map([['BTC', pricing('100')]]));
  assert.equal(result.totalAssetKRW, 100);
  const btc = result.assets.find(a => a.currency === 'BTC');
  assert.equal(btc.balance, 0.1);
  assert.equal(btc.valuation, 10);
  assert.equal(btc.costBasisKRW, 8);
  assert.equal(btc.profit, 2);
  assert.equal(btc.profitRate, 25);
  assert.equal(btc.portfolioWeight, 10);
  const cash = result.assets.find(a => a.currency === 'KRW');
  assert.equal(cash.currentPrice, 1);
  assert.equal(cash.valuation, 90);
  assert.equal(cash.profit, 0);
  assert.equal(cash.portfolioWeight, 90);
});

test('specification BTC example is calculated correctly', () => {
  const result = calc([account('BTC', '0.042', '0', '90000000')], new Map([['BTC', pricing('95200000')]]));
  assert.equal(result.assets[0].valuation, 3998400);
  assert.equal(result.assets[0].profit, 218400);
  assert.equal(result.assets[0].profitRate, 5.7778);
});

test('decimal arithmetic, losses, empty wallet and zero balances', () => {
  const decimal = calc([account('BTC', '0.1', '0.2', '0.2')], new Map([['BTC', pricing('0.3')]])).assets[0];
  assert.equal(decimal.balance, 0.3);
  assert.equal(decimal.valuation, 0.09);
  assert.equal(decimal.costBasisKRW, 0.06);
  assert.equal(decimal.profit, 0.03);
  assert.equal(decimal.profitRate, 50);
  assert.equal(calc([account('BTC', '1', '0', '100')], new Map([['BTC', pricing('90')]])).assets[0].profitRate, -10);
  assert.equal(calc([]).totalAssetKRW, 0);
  assert.deepEqual(calc([account('BTC', '0')]).assets, []);
});

test('unknown cost and non-KRW historical average do not fabricate profit', () => {
  for (const row of [account('BTC', '1'), account('ETH', '1', '0', '0.1', 'BTC')]) {
    const result = calc([row], new Map([[row.currency, pricing('100')]]));
    assert.equal(result.totalAssetKRW, 100);
    assert.equal(result.assets[0].profit, null);
    assert.equal(result.assets[0].profitRate, null);
    assert.equal(result.assets[0].costBasisKRW, null);
  }
});

test('unpriced asset makes total and all weights unknown while preserving known cash value', () => {
  const result = calc([account('KRW', '80', '10'), account('OLD', '1')]);
  assert.equal(result.totalAssetKRW, null);
  assert.equal(result.knownValueKRW, 90);
  assert.equal(result.valuationComplete, false);
  assert.deepEqual(result.unpricedCurrencies, ['OLD']);
  assert.ok(result.assets.every(asset => asset.portfolioWeight === null));
  assert.equal(result.assets.find(asset => asset.currency === 'OLD').valuation, null);
});

test('portfolio service converts BTC-only market valuation via KRW-BTC', async () => {
  const calls = [];
  const service = new PortfolioService({
    getAccounts: async () => [account('XYZ', '2', '0', '0.05', 'BTC')],
    getMarkets: async () => [{ market: 'BTC-XYZ' }, { market: 'KRW-BTC' }],
    getQuotes: async markets => {
      calls.push(markets);
      return [{ market: 'BTC-XYZ', price: 0.1, timestamp: new Date() }, { market: 'KRW-BTC', price: 100000000, timestamp: new Date() }];
    },
  }, new PortfolioCalculator());
  const result = await service.getPortfolio();
  assert.equal(result.totalAssetKRW, 20000000);
  assert.equal(result.assets[0].currentPrice, 10000000);
  assert.equal(result.assets[0].profit, null);
  assert.deepEqual(calls, [['BTC-XYZ', 'KRW-BTC']]);
});

test('cash-only portfolio avoids market calls, account failures propagate and price failures are explicit', async () => {
  const cash = new PortfolioService({ getAccounts: async () => [account('KRW', '10')] }, new PortfolioCalculator());
  assert.equal((await cash.getPortfolio()).totalAssetKRW, 10);
  const failed = new PortfolioService({ getAccounts: async () => { throw new Error('account unavailable'); } }, new PortfolioCalculator());
  await assert.rejects(failed.getPortfolio(), /account unavailable/);
  for (const failStage of ['getMarkets', 'getQuotes']) {
    const client = { getAccounts: async () => [account('BTC', '1')], getMarkets: async () => [{ market: 'KRW-BTC' }], getQuotes: async () => [] };
    client[failStage] = async () => { throw new Error('unavailable'); };
    const partial = await new PortfolioService(client, new PortfolioCalculator()).getPortfolio();
    assert.equal(partial.valuationComplete, false);
    assert.equal(partial.totalAssetKRW, null);
    assert.equal(partial.assets[0].pricingUnavailableReason, failStage === 'getMarkets' ? 'MARKET_LIST_UNAVAILABLE' : 'QUOTE_UNAVAILABLE');
  }
});

test('unlisted holding stays in the portfolio with an explicit unsupported-market reason', async () => {
  const result = await new PortfolioService({
    getAccounts: async () => [account('OLD', '1')], getMarkets: async () => [],
    getQuotes: async () => assert.fail('no market exists to query'),
  }, new PortfolioCalculator()).getPortfolio();
  assert.equal(result.assets[0].pricingUnavailableReason, 'NO_SUPPORTED_MARKET');
  assert.equal(result.assets[0].balance, 1);
  assert.equal(result.totalAssetKRW, null);
});

test('portfolio guard requires a separate token and disables response caching even on rejection', () => {
  const headers = {};
  const context = token => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-monitor-token': token } }), getResponse: () => ({ setHeader: (name, value) => { headers[name] = value; } }) }) });
  const guard = new PortfolioGuard(environment);
  assert.equal(guard.canActivate(context(environment.portfolioApiToken)), true);
  for (const value of [undefined, 'wrong', ['t'.repeat(64)]]) assert.throws(() => guard.canActivate(context(value)), status(401));
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.throws(() => new PortfolioGuard({}).canActivate(context('test')), status(503));
});
