/**
 * Admin API — dashboard endpoints for monitoring.
 * All routes require ADMIN_TOKEN via Bearer header or X-Admin-Token.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { getConsumptionSummary } = require('./consumption');

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
        ),
        user_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
          FROM users
        )
      SELECT
        (SELECT row_to_json(visitor_stats) FROM visitor_stats) AS visitors,
        (SELECT row_to_json(lead_stats) FROM lead_stats) AS leads,
        (SELECT row_to_json(user_stats) FROM user_stats) AS users,
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

// -- GET /api/admin/visitors (paginated) ------------------
router.get('/visitors', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [countResult, dataResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM visitors'),
      pool.query(`SELECT session_id, current_page, device_type, user_agent, country, city,
                         utm_source, utm_medium, utm_campaign, referrer, created_at, last_activity
                  FROM visitors ORDER BY last_activity DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    ]);

    res.json({
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] visitors error:', err.message);
    res.status(500).json({ error: 'Failed to load visitors' });
  }
});

// -- GET /api/admin/users (paginated) --------------------
router.get('/users', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim().toLowerCase();

    let where = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE LOWER(u.email) LIKE $1 OR LOWER(u.display_name) LIKE $1`;
    }

    const countQuery = `SELECT COUNT(*) AS total FROM users u ${where}`;
    const dataQuery = `
      SELECT u.id, u.email, u.display_name, u.auth_provider, u.country, u.city,
             u.device_type, u.user_agent, u.created_at, u.last_activity,
             s.plan AS sub_plan, s.status AS sub_status
      FROM users u
      LEFT JOIN LATERAL (
        SELECT plan, status FROM subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) s ON true
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    res.json({
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
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

// -- GET /api/admin/consumption/summary ----------------------
router.get('/consumption/summary', async (req, res) => {
  try {
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const summary = await getConsumptionSummary(period);
    if (!summary) return res.json({ totalCostUsd: 0, totalTips: 0, byProvider: [], byModel: [], byCompanion: [], daily: [] });
    res.json(summary);
  } catch (err) {
    console.error('[admin] consumption summary error:', err.message);
    res.status(500).json({ error: 'Failed to load consumption summary' });
  }
});

// -- GET /api/admin/reports (paginated) -------------------------
router.get('/reports', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ reports: [], total: 0, pendingCount: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let where = '';
    const params = [];
    if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      params.push(status);
      where = `WHERE cr.status = $1`;
    }

    const countQuery = `SELECT COUNT(*) AS total FROM content_reports cr ${where}`;
    const pendingQuery = `SELECT COUNT(*) AS count FROM content_reports WHERE status = 'pending'`;
    const dataQuery = `
      SELECT cr.id, cr.user_id, cr.companion_id, cr.reason, cr.details, cr.status,
             cr.created_at, cr.context_messages,
             u.email AS user_email, uc.name AS companion_name
      FROM content_reports cr
      LEFT JOIN users u ON u.id = cr.user_id
      LEFT JOIN user_companions uc ON uc.id = cr.companion_id
      ${where}
      ORDER BY cr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, pendingResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(pendingQuery),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    res.json({
      reports: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      pendingCount: parseInt(pendingResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] reports error:', err.message);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

// -- PATCH /api/admin/reports/:id -------------------------------
router.patch('/reports/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { status } = req.body || {};
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rowCount } = await pool.query(
      'UPDATE content_reports SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] report update error:', err.message);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// -- Sentry ---------------------------------------------------
const SENTRY_AUTH = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG_SLUG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT_SLUG;
const SENTRY_API = 'https://sentry.io/api/0';

// GET /api/admin/sentry/status
router.get('/sentry/status', (req, res) => {
  res.json({ configured: Boolean(SENTRY_AUTH && SENTRY_ORG && SENTRY_PROJECT) });
});

// GET /api/admin/sentry/issues
router.get('/sentry/issues', async (req, res) => {
  if (!SENTRY_AUTH || !SENTRY_ORG || !SENTRY_PROJECT) {
    return res.json({ issues: [], configured: false });
  }
  try {
    const query = req.query.query || 'is:unresolved';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const r = await fetch(
      `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=${encodeURIComponent(query)}&limit=${limit}&shortIdLookup=0&statsPeriod=14d`,
      { headers: { Authorization: `Bearer ${SENTRY_AUTH}` } }
    );
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `Sentry API: ${r.status} ${err}` });
    }
    const issues = await r.json();
    res.json({ issues });
  } catch (err) {
    console.error('[admin] sentry issues error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/sentry/issues/:id
router.patch('/sentry/issues/:id', async (req, res) => {
  if (!SENTRY_AUTH) return res.status(503).json({ error: 'Sentry not configured' });
  try {
    const { status } = req.body;
    if (!['resolved', 'ignored', 'unresolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use: resolved, ignored, unresolved' });
    }
    const r = await fetch(`${SENTRY_API}/issues/${req.params.id}/`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `Sentry API: ${r.status} ${err}` });
    }
    const issue = await r.json();
    res.json({ issue });
  } catch (err) {
    console.error('[admin] sentry issue update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
