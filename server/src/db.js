/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL (Heroku Postgres) or TEST_DATABASE_URL for tests.
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  const url = process.env.NODE_ENV === 'test'
    ? (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

  if (!url) return null;

  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
  const sslMode = process.env.PGSSLMODE || 'require';
  const rejectUnauthorized = process.env.PGSSL_REJECT_UNAUTHORIZED === 'true';
  const ssl = isLocalhost || sslMode === 'disable' ? false : { rejectUnauthorized };

  // 5s connect timeout was too aggressive on Heroku Essential-0 — first-connect
  // latency to RDS sometimes spikes into the 10-20s range, which produced the
  // 2026-06-12 boot storm (every dyno start timed out). 15s tolerates the spike
  // while still failing fast enough that healthchecks aren't useless.
  pool = new Pool({
    connectionString: url,
    ssl,
    max: parseInt(process.env.PG_POOL_MAX || '18', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '15000', 10),
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
  });

  return pool;
}

module.exports = { getPool };
