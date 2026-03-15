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

  pool = new Pool({
    connectionString: url,
    ssl,
    max: 5,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
  });

  return pool;
}

module.exports = { getPool };
