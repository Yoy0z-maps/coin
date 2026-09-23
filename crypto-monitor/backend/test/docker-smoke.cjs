// Run explicitly against this project's local Docker stack, never a shared DB.
// Temporarily stops/recreates this project's two containers; preserves its volume.
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const cwd = resolve(__dirname, '../..');
const key = `phase1-smoke-${randomUUID()}`;

function compose(args) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd, encoding: 'utf8', timeout: 120000,
  });
  if (result.error || result.status !== 0) throw new Error(`Docker smoke command failed: ${args[0]}`);
  return result.stdout.trim();
}
function sql(query) {
  return compose(['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'crypto', '-d', 'crypto_monitor', '-Atc', query]);
}
function health(status) {
  compose(['exec', '-T', 'crypto-backend', 'node', '-e',
    `fetch('http://127.0.0.1:3000/health', {signal: AbortSignal.timeout(10000)}).then(async r => { const b = await r.json(); if (r.status !== ${status} || b.database !== '${status === 200 ? 'up' : 'down'}') process.exit(1); }).catch(() => process.exit(1));`]);
}

let stopped = false;
let inserted = false;
try {
  health(200);
  sql(`INSERT INTO application_settings (key, value, updated_at) VALUES ('${key}', '{"persistent":true}', now())`);
  inserted = true;
  const previousDatabase = compose(['ps', '-q', 'postgres']);
  const previousBackend = compose(['ps', '-q', 'crypto-backend']);
  compose(['stop', 'postgres']);
  stopped = true;
  health(503);
  console.log('PASS: database outage returns HTTP 503');
  compose(['start', 'postgres']);
  stopped = false;
  compose(['up', '-d', '--wait', '--wait-timeout', '60']);
  health(200);
  assert.equal(compose(['ps', '-q', 'crypto-backend']), previousBackend);
  console.log('PASS: database recovery returns HTTP 200 without backend restart');
  compose(['up', '-d', '--force-recreate', '--wait', '--wait-timeout', '60']);
  assert.notEqual(compose(['ps', '-q', 'postgres']), previousDatabase);
  assert.equal(sql(`SELECT value->>'persistent' FROM application_settings WHERE key='${key}'`), 'true');
  health(200);
  console.log('PASS: data survives container recreation; health returns HTTP 200');
} finally {
  if (stopped) compose(['start', 'postgres']);
  compose(['up', '-d', '--wait', '--wait-timeout', '60']);
  if (inserted) sql(`DELETE FROM application_settings WHERE key='${key}'`);
}
