const { localAccess, fetchPortfolio } = require('../scripts/portfolio.cjs');

// Deliberately do not print real currencies, balances, values, keys or the response body.
function check(condition, label) { if (!condition) throw new Error(`Portfolio validation failed: ${label}`); }
async function main() {
  const { base } = localAccess();
  for (const headers of [{}, { 'X-Monitor-Token': 'incorrect' }]) {
    const response = await fetch(`${base}/portfolio`, { headers, signal: AbortSignal.timeout(10000) });
    check(response.status === 401, 'unauthorized access');
    check(response.headers.get('cache-control') === 'no-store', 'unauthorized cache policy');
    await response.body?.cancel();
  }
  console.log('PASS: missing and invalid local tokens rejected');
  const { body, response } = await fetchPortfolio();
  check(response.headers.get('cache-control') === 'no-store', 'cache policy');
  check(Array.isArray(body.assets), 'assets array');
  check(Number.isFinite(Date.parse(body.accountsFetchedAt)), 'account retrieval timestamp');
  check(Number.isFinite(body.knownValueKRW) && body.knownValueKRW >= 0, 'known valuation');
  check(body.assets.every(asset => asset.balance > 0 && asset.availableBalance >= 0 && asset.locked >= 0), 'balance values');
  if (body.valuationComplete) {
    check(Number.isFinite(body.totalAssetKRW) && body.totalAssetKRW >= 0, 'total value');
    const sum = body.assets.reduce((total, asset) => total + asset.valuation, 0);
    check(Math.abs(sum - body.totalAssetKRW) <= (body.assets.length + 1) * 0.01, 'aggregate valuation');
    if (body.totalAssetKRW > 0) {
      const weights = body.assets.reduce((total, asset) => total + asset.portfolioWeight, 0);
      check(Math.abs(weights - 100) <= (body.assets.length + 1) * 0.0001, 'weights');
    }
    console.log('PASS: authenticated real account lookup and complete portfolio valuation');
  } else {
    check(body.totalAssetKRW === null && body.unpricedCurrencies.length > 0, 'partial valuation');
    check(body.assets.every(asset => asset.portfolioWeight === null), 'partial weights');
    console.log('PASS: real account lookup; valuation explicitly partial because some prices are unavailable');
  }
  console.log('PASS: no-store response; private data omitted from test output');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
