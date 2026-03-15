/**
 * Global teardown — stop server, clean test DB, remove port file.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const PORT_FILE = path.join(__dirname, '.test-port');

module.exports = async function globalTeardown() {
  const server = globalThis.__SERVER_PROCESS__;
  if (server) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 500));
    try { server.kill('SIGKILL'); } catch {}
  }

  try { fs.unlinkSync(PORT_FILE); } catch {}

  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test';
  try {
    const pool = new Pool({ connectionString: testDbUrl });
    await pool.query(`
      DROP TABLE IF EXISTS refresh_tokens CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS app_settings CASCADE;
      DROP TABLE IF EXISTS leads CASCADE;
      DROP TABLE IF EXISTS visitors CASCADE;
      DROP TABLE IF EXISTS _migrations CASCADE;
      DROP TYPE IF EXISTS _migrations CASCADE;
    `);
    await pool.end();
    console.log('[teardown] Test tables dropped');
  } catch (err) {
    console.warn('[teardown] Could not clean DB:', err.message);
  }
};
