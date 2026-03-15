/**
 * Database migrations for Lovetta.
 * Run with: node server/src/migrate.js
 */

const { getPool } = require('./db');

const MIGRATIONS = [
  {
    name: '001_visitors',
    sql: `
      CREATE TABLE IF NOT EXISTS visitors (
        id            SERIAL PRIMARY KEY,
        session_id    TEXT UNIQUE NOT NULL,
        current_page  TEXT,
        device_type   TEXT,
        screen_resolution TEXT,
        user_agent    TEXT,
        ip_address    TEXT,
        language      TEXT,
        timezone      TEXT,
        country       TEXT,
        state         TEXT,
        city          TEXT,
        utm_source    TEXT,
        utm_medium    TEXT,
        utm_campaign  TEXT,
        gclid         TEXT,
        referrer      TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        last_activity TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: '002_leads',
    sql: `
      CREATE TABLE IF NOT EXISTS leads (
        id            SERIAL PRIMARY KEY,
        email         TEXT NOT NULL,
        birth_month   INTEGER,
        birth_year    INTEGER,
        source        TEXT DEFAULT 'landing',
        session_id    TEXT,
        page_path     TEXT,
        referrer      TEXT,
        utm_source    TEXT,
        utm_medium    TEXT,
        utm_campaign  TEXT,
        country       TEXT,
        city          TEXT,
        context       JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON leads(LOWER(email));
    `,
  },
  {
    name: '003_app_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO app_settings (key, value) VALUES
        ('text_level_web', '2'),
        ('text_level_appstore', '0'),
        ('text_level_telegram', '1'),
        ('image_level_web', '2'),
        ('image_level_appstore', '0'),
        ('image_level_telegram', '1')
      ON CONFLICT (key) DO NOTHING;
    `,
  },
];

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.warn('[migrate] No database configured, skipping migrations');
    return;
  }

  const { rows: migrationRelation } = await pool.query(`
    SELECT to_regclass('_migrations') AS table_name,
           to_regtype('_migrations') AS type_name
  `);
  if (!migrationRelation[0].table_name && migrationRelation[0].type_name) {
    await pool.query('DROP TYPE IF EXISTS _migrations CASCADE');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rows: applied } = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.name)) continue;
    console.log(`[migrate] Applying ${m.name}...`);
    await pool.query(m.sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [m.name]);
  }

  console.log('[migrate] All migrations applied');
}

// Run directly
if (require.main === module) {
  try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
  migrate().then(() => process.exit(0)).catch(err => {
    console.error('[migrate] Error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
