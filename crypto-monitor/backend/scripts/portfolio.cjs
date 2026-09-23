// Host-side helper. Reads only the local access token; never sends exchange keys.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

function localAccess() {
  const env = parseEnv(readFileSync(resolve(__dirname, '../../.env'), 'utf8'));
  const token = (env.PORTFOLIO_API_TOKEN || '').trim();
  const port = env.BACKEND_PORT || '3000';
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid local portfolio access configuration');
  }
  return { base: `http://127.0.0.1:${port}`, token };
}

async function fetchPortfolio() {
  const { base, token } = localAccess();
  const response = await fetch(`${base}/portfolio`, {
    headers: { 'X-Monitor-Token': token }, signal: AbortSignal.timeout(60000), redirect: 'error',
  });
  const body = await response.json();
  if (!response.ok) {
    const allowed = ['BITHUMB_KEYS_MISSING', 'BITHUMB_AUTH_REJECTED', 'BITHUMB_IP_NOT_ALLOWED',
      'BITHUMB_READ_PERMISSION_REQUIRED', 'BITHUMB_TOKEN_EXPIRED', 'BITHUMB_SIGNATURE_REJECTED'];
    const code = allowed.includes(body.code) ? ` ${body.code}` : '';
    throw new Error(`Portfolio request failed: HTTP ${response.status}${code}`);
  }
  return { body, response };
}

module.exports = { localAccess, fetchPortfolio };
if (require.main === module) {
  fetchPortfolio().then(({ body }) => console.log(JSON.stringify(body, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
