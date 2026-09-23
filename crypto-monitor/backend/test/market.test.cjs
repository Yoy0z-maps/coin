require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Logger } = require('@nestjs/common');
const { normalizeMarket, parseCandleQuery } = require('../dist/common/market');
const { mapTicker, mapCandles, mapMarkets } = require('../dist/bithumb/bithumb.mapper');
const { BithumbRestClient } = require('../dist/bithumb/bithumb-rest.client');
const { MarketService } = require('../dist/market/market.service');
Logger.overrideLogger(false);

const options = { timeoutMs: 1000, intervalMs: 0, maxQueueMs: 0 };
const ticker = { market: 'KRW-BTC', trade_price: 95000000, signed_change_rate: -0.01,
  prev_closing_price: 96000000, high_price: 97000000, low_price: 94000000,
  acc_trade_volume_24h: 12, acc_trade_price_24h: 1140000000, timestamp: 1790126400000 };
const candle = { market: 'KRW-BTC', candle_date_time_utc: '2026-09-23T01:00:00',
  opening_price: 100, high_price: 110, low_price: 90, trade_price: 105,
  candle_acc_trade_volume: 12, unit: 60, timestamp: 1790126483000 };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const status = code => error => error.getStatus() === code;

test('market normalization accepts lowercase, bare symbols and BTC quote', () => {
  assert.equal(normalizeMarket(' btc '), 'KRW-BTC');
  assert.equal(normalizeMarket('krw-eth'), 'KRW-ETH');
  assert.equal(normalizeMarket('btc-eth'), 'BTC-ETH');
  for (const value of ['', 'KRW-', 'BTC-BTC', 'KRW-KRW', 'USD-BTC', 'BTC,ETH', '../BTC', 'BTC?x=1', [], null]) {
    assert.throws(() => normalizeMarket(value), status(400));
  }
});

test('candle input validation rejects arrays, inherited properties and invalid limits', () => {
  assert.deepEqual(parseCandleQuery(), { timeframe: '1h', limit: 100 });
  for (const timeframe of ['1m', '5m', '15m', '1h', '4h', '1d']) assert.equal(parseCandleQuery(timeframe, '200').limit, 200);
  for (const timeframe of ['__proto__', 'toString', '2h', '', ['1h']]) assert.throws(() => parseCandleQuery(timeframe), status(400));
  for (const limit of ['0', '201', '-1', '1.5', '1e2', '', ' 1', ['1'], '9999']) assert.throws(() => parseCandleQuery('1h', limit), status(400));
});

test('ticker mapper keeps previous-close ratio separate from rolling 24h percent', () => {
  const dto = mapTicker([ticker], 'KRW-BTC');
  assert.equal(dto.changeRate, -0.01);
  assert.equal(dto.changeRateBasis, 'PREVIOUS_CLOSE_KST');
  assert.equal(dto.change24h, null);
  assert.equal(dto.volume24h, 12);
  assert.ok(dto.timestamp instanceof Date);
  assert.equal(dto.high24h, undefined);
  assert.equal(dto.trade_price, undefined);
});

test('invalid or mismatched exchange values are rejected instead of becoming zero/NaN', () => {
  for (const price of [null, '', ' ', true, 'NaN', Infinity, -1, {}, undefined]) {
    assert.throws(() => mapTicker([{ ...ticker, trade_price: price }], 'KRW-BTC'));
  }
  assert.throws(() => mapTicker([], 'KRW-BTC'));
  assert.throws(() => mapTicker([ticker], 'KRW-ETH'));
  assert.throws(() => mapTicker([{ ...ticker, timestamp: 'invalid' }], 'KRW-BTC'));
  assert.throws(() => mapMarkets([{ market: 'KRW-BTC', korean_name: 'BTC', english_name: 'BTC' }]));
});

test('candles use UTC candle start, sort ascending, keep unfinished candles', () => {
  const result = mapCandles([candle, { ...candle, candle_date_time_utc: '2026-09-23T00:00:00' }], 'KRW-BTC', 60, 2);
  assert.equal(result[0].timestamp.toISOString(), '2026-09-23T00:00:00.000Z');
  assert.equal(result[1].timestamp.toISOString(), '2026-09-23T01:00:00.000Z');
  assert.equal(result[1].close, 105);
  assert.deepEqual(mapCandles([], 'KRW-BTC', 60, 100), []);
});

test('candles reject duplicate time, invalid UTC, wrong interval, market and broken OHLC', () => {
  assert.throws(() => mapCandles([candle, candle], 'KRW-BTC', 60, 2));
  for (const change of [{ candle_date_time_utc: '2026-02-30T01:00:00' }, { unit: 1 }, { market: 'KRW-ETH' }, { high_price: 10 }]) {
    assert.throws(() => mapCandles([{ ...candle, ...change }], 'KRW-BTC', 60, 1));
  }
});

test('public requests use only official GET routes and carry no credentials', async () => {
  const calls = [];
  const client = new BithumbRestClient(async (url, init) => {
    calls.push({ url, init });
    return url.pathname === '/v1/ticker' ? json([ticker]) : json({ status: '0000', data: { fluctate_rate_24H: '2.3', date: '1790126400000' } });
  }, options);
  const dto = await client.getTicker('btc');
  assert.equal(dto.changeRate, -0.01);
  assert.equal(dto.change24h, 2.3);
  assert.equal(calls[0].url.searchParams.get('markets'), 'KRW-BTC');
  assert.equal(calls[1].url.pathname, '/public/ticker/BTC_KRW');
  for (const { url, init } of calls) {
    assert.equal(url.origin, 'https://api.bithumb.com');
    assert.equal(init.method, 'GET');
    assert.deepEqual(init.headers, { accept: 'application/json' });
    assert.equal(init.redirect, 'error');
  }
});

test('all six candle timeframes route to the documented endpoint and count', async () => {
  for (const [timeframe, suffix] of Object.entries({ '1m': 'minutes/1', '5m': 'minutes/5', '15m': 'minutes/15', '1h': 'minutes/60', '4h': 'minutes/240', '1d': 'days' })) {
    const client = new BithumbRestClient(async url => {
      assert.equal(url.pathname, `/v1/candles/${suffix}`);
      assert.equal(url.searchParams.get('count'), '100');
      assert.equal(url.searchParams.get('market'), 'KRW-BTC');
      return json([]);
    }, options);
    await client.getCandles('BTC', timeframe, 100);
  }
});

test('24h supplement failure preserves current price with explicit nulls', async () => {
  const client = new BithumbRestClient(async url => url.pathname === '/v1/ticker' ? json([ticker]) : json({ secret: 'must not escape' }, 500), options);
  const result = await client.getTicker('BTC');
  assert.equal(result.price, 95000000);
  assert.equal(result.change24h, null);
  assert.equal(result.change24hTimestamp, null);
});

test('HTTP errors have stable statuses and never forward upstream bodies', async () => {
  for (const [upstream, expected] of [[400, 400], [404, 404], [401, 502], [429, 503], [500, 502]]) {
    const client = new BithumbRestClient(async () => json({ message: 'secret-token' }, upstream), options);
    await assert.rejects(client.getMarkets(), error => {
      assert.equal(error.getStatus(), expected);
      assert.ok(!JSON.stringify(error.getResponse()).includes('secret-token'));
      return true;
    });
  }
});

test('network error and malformed JSON produce sanitized 502', async () => {
  for (const fetcher of [async () => { throw new Error('secret-token'); }, async () => new Response('{')]) {
    const client = new BithumbRestClient(fetcher, options);
    await assert.rejects(client.getMarkets(), error => {
      assert.equal(error.getStatus(), 502);
      assert.ok(!error.message.includes('secret-token'));
      return true;
    });
  }
});

test('timeout aborts fetch and produces 504', async () => {
  const client = new BithumbRestClient((_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(json([])), 200);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
  }), { ...options, timeoutMs: 20 });
  await assert.rejects(client.getMarkets(), status(504));
});

test('429 pauses subsequent outbound calls', async () => {
  let calls = 0;
  const client = new BithumbRestClient(async () => { calls++; return json({}, 429, { 'retry-after': '10' }); }, options);
  await assert.rejects(client.getMarkets(), status(503));
  await assert.rejects(client.getMarkets(), status(503));
  assert.equal(calls, 1);
});

test('bounded queue rejects excess work without calling Bithumb', async () => {
  let calls = 0;
  const client = new BithumbRestClient(async () => { calls++; return json([]); }, { ...options, intervalMs: 10000 });
  await client.getMarkets();
  await assert.rejects(client.getMarkets(), status(503));
  assert.equal(calls, 1);
});

test('service rejects invalid query before reaching client', () => {
  const service = new MarketService({ getCandles: () => assert.fail('must not call exchange') });
  assert.throws(() => service.getCandles('BTC', '1h', '201'), status(400));
});
