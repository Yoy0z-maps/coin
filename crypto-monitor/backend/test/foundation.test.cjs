const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { validateEnvironment } = require('../dist/config/environment');
const { HealthController } = require('../dist/health/health.controller');

const base = { DATABASE_URL: 'postgresql://crypto:test-password@postgres:5432/crypto_monitor' };

test('Phase 1 starts without external API credentials', () => {
  assert.equal(validateEnvironment(base).port, 3000);
});

test('invalid environment fails without leaking values', () => {
  for (const [name, value] of Object.entries({
    DATABASE_URL: 'secret-invalid-url', PORT: 'secret-invalid-port',
    NODE_ENV: 'secret-invalid-env', TZ: 'secret-invalid-zone',
    DISCORD_WEBHOOK_URL: 'https://evil.example/secret-token',
  })) {
    assert.throws(() => validateEnvironment({ ...base, [name]: value }), error => {
      assert.ok(error.message.includes(name));
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
  assert.throws(() => validateEnvironment({}), /DATABASE_URL/);
  assert.throws(() => validateEnvironment({ ...base, BITHUMB_ACCESS_KEY: 'secret' }), /BITHUMB_ACCESS_KEY/);
});

test('health returns 200 payload only when database and schema are ready', async () => {
  const controller = new HealthController({ isReady: async () => true });
  assert.equal((await controller.check()).database, 'up');
});

test('health returns sanitized 503 on database failure', async () => {
  const controller = new HealthController({ isReady: async () => false });
  await assert.rejects(controller.check(), error => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().database, 'down');
    return true;
  });
});
