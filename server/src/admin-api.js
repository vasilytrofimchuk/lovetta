/**
 * Admin API — dashboard endpoints for monitoring.
 * All routes require ADMIN_TOKEN via Bearer header or X-Admin-Token.
 */

const { Router } = require('express');
const { getPool } = require('./db');

const router = Router();

// -- Auth middleware ---------------------------------------
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'Admin not configured' });
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === ADMIN_TOKEN) return next();
  const alt = (req.get('X-Admin-Token') || '').trim();
  if (alt === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

// -- GET /api/admin/stats ---------------------------------
router.get('/stats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ visitors: {}, leads: {} });

  try {
    const { rows: [stats] } = await pool.query(`
      WITH
        visitor_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today,
            COUNT(*) FILTER (WHERE last_activity >= NOW() - INTERVAL '15 minutes') AS active
          FROM visitors
        ),
        lead_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today,
            COUNT(DISTINCT LOWER(email)) AS unique_emails
          FROM leads
        ),
        countries AS (
          SELECT country, COUNT(*) AS count FROM visitors
          WHERE country IS NOT NULL
          GROUP BY country ORDER BY count DESC LIMIT 10
        ),
        cities AS (
          SELECT city, COUNT(*) AS count FROM visitors
          WHERE city IS NOT NULL AND city != ''
          GROUP BY city ORDER BY count DESC LIMIT 10
        ),
        devices AS (
          SELECT device_type, COUNT(*) AS count FROM visitors
          WHERE device_type IS NOT NULL
          GROUP BY device_type ORDER BY count DESC
        ),
        sources AS (
          SELECT utm_source, COUNT(*) AS count FROM visitors
          WHERE utm_source IS NOT NULL AND utm_source != ''
          GROUP BY utm_source ORDER BY count DESC LIMIT 10
        ),
        mediums AS (
          SELECT utm_medium, COUNT(*) AS count FROM visitors
          WHERE utm_medium IS NOT NULL AND utm_medium != ''
          GROUP BY utm_medium ORDER BY count DESC LIMIT 10
        ),
        campaigns AS (
          SELECT utm_campaign, COUNT(*) AS count FROM visitors
          WHERE utm_campaign IS NOT NULL AND utm_campaign != ''
          GROUP BY utm_campaign ORDER BY count DESC LIMIT 10
        ),
        referrers AS (
          SELECT
            CASE WHEN referrer ~ '^https?://' THEN split_part(split_part(referrer, '://', 2), '/', 1)
                 ELSE referrer END AS referrer_domain,
            COUNT(*) AS count
          FROM visitors
          WHERE referrer IS NOT NULL AND referrer != ''
          GROUP BY referrer_domain ORDER BY count DESC LIMIT 10
        )
      SELECT
        (SELECT row_to_json(visitor_stats) FROM visitor_stats) AS visitors,
        (SELECT row_to_json(lead_stats) FROM lead_stats) AS leads,
        (SELECT COALESCE(json_agg(countries), '[]') FROM countries) AS countries,
        (SELECT COALESCE(json_agg(cities), '[]') FROM cities) AS cities,
        (SELECT COALESCE(json_agg(devices), '[]') FROM devices) AS devices,
        (SELECT COALESCE(json_agg(sources), '[]') FROM sources) AS sources,
        (SELECT COALESCE(json_agg(mediums), '[]') FROM mediums) AS mediums,
        (SELECT COALESCE(json_agg(campaigns), '[]') FROM campaigns) AS campaigns,
        (SELECT COALESCE(json_agg(referrers), '[]') FROM referrers) AS referrers
    `);

    res.json(stats);
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// -- GET /api/admin/leads ---------------------------------
router.get('/leads', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ leads: [], total: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim().toLowerCase();

    let where = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE LOWER(email) LIKE $1`;
    }

    const countQuery = `SELECT COUNT(*) AS total FROM leads ${where}`;
    const dataQuery = `SELECT id, email, birth_month, birth_year, source, utm_source, utm_medium, utm_campaign, country, city, created_at
      FROM leads ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    res.json({
      leads: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] leads error:', err.message);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

// -- GET /api/admin/settings ------------------------------
router.get('/settings', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ settings: {} });

  try {
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json({ settings });
  } catch (err) {
    console.error('[admin] settings error:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// -- PUT /api/admin/settings ------------------------------
router.put('/settings', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { key, value } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Missing key' });
    }

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key.trim(), JSON.stringify(value)]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] settings update error:', err.message);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

module.exports = router;
