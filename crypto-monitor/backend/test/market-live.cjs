// Explicit opt-in integration check: calls the running local Backend and public Bithumb APIs.
const assert = require('node:assert/strict');
const base = process.env.MARKET_SMOKE_BASE_URL || 'http://127.0.0.1:3000';

async function get(path, expected = 200) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected, `Unexpected status for ${path}`);
  return response.json();
}

async function main() {
  assert.equal((await get('/health')).database, 'up');
  const markets = await get('/markets');
  assert.ok(markets.length > 0);
  assert.ok(markets.some(row => row.market === 'KRW-BTC'));
  assert.ok(markets.every(row => row.koreanName && row.englishName));
  console.log(`PASS: markets (${markets.length}) and database health`);
  for (const market of ['btc', 'KRW-ETH', 'KRW-XRP']) {
    const ticker = await get(`/market/${market}/ticker`);
    assert.ok(ticker.price > 0);
    assert.equal(ticker.market, market === 'btc' ? 'KRW-BTC' : market);
    assert.equal(ticker.changeRateBasis, 'PREVIOUS_CLOSE_KST');
    assert.ok(Number.isFinite(ticker.volume24h));
    assert.ok(Number.isFinite(ticker.change24h), '24h supplement must succeed for live acceptance');
    assert.ok(Number.isFinite(Date.parse(ticker.timestamp)));
    assert.ok(Number.isFinite(Date.parse(ticker.change24hTimestamp)));
    console.log(`PASS: ${ticker.market} ticker, 24h change and normalized DTO`);
  }
  for (const timeframe of ['1m', '5m', '15m', '1h', '4h', '1d']) {
    const rows = await get(`/market/BTC/candles?timeframe=${timeframe}&limit=100`);
    assert.equal(rows.length, 100);
    assert.ok(rows.every(row => row.high >= row.low && Number.isFinite(row.volume)));
    for (let i = 1; i < rows.length; i++) assert.ok(Date.parse(rows[i].timestamp) > Date.parse(rows[i-1].timestamp));
    console.log(`PASS: ${timeframe} candles (100), UTC and ascending order`);
  }
  assert.equal((await get('/market/BTC/candles?limit=200')).length, 200);
  for (const path of ['/market/BTC/candles?limit=201', '/market/BTC/candles?timeframe=2h',
    '/market/BTC/candles?limit=1&limit=2', '/market/BTC/candles?timeframe=__proto__', '/market/BTC,ETH/ticker']) {
    await get(path, 400);
  }
  console.log('PASS: limit=200 and invalid input HTTP 400');
  assert.equal((await get('/health')).database, 'up');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
