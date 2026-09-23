const { spawnSync } = require('node:child_process');
const { validateEnvironment } = require('../dist/config/environment');

try {
  validateEnvironment(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Keep raw Prisma CLI errors out of logs because they can contain connection details.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'pipe',
  timeout: 120000,
});
if (result.error || result.status !== 0) {
  console.error('Database migration failed; check database connectivity, credentials and migration history');
  process.exit(1);
}
console.log('Database migrations applied');
require('../dist/main');

