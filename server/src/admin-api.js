/**
 * Admin API — dashboard endpoints for monitoring.
 * All routes require ADMIN_TOKEN via Bearer header or X-Admin-Token.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { getConsumptionSummary, getFishAudioUsage } = require('./consumption');
const { getFishAudioBalance } = require('./ai');
const { invalidateSettingsCache } = require('./content-levels');

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
  if (!pool) return res.json({ visitors: {} });

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
        platforms AS (
          SELECT
            CASE WHEN (user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%')
                      AND user_agent NOT LIKE '%Safari/%'
                 THEN 'iOS App'
                 ELSE 'Web' END AS platform,
            COUNT(*) AS count
          FROM users
          WHERE user_agent IS NOT NULL
          GROUP BY platform ORDER BY count DESC
        ),
        user_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
          FROM users
        ),
        online_stats AS (
          SELECT
            (SELECT COUNT(*) FROM visitors WHERE last_activity >= NOW() - INTERVAL '5 minutes') AS visitors_online,
            COUNT(*) AS users_online,
            COUNT(*) FILTER (WHERE (user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%') AND user_agent NOT LIKE '%Safari/%') AS users_ios,
            COUNT(*) FILTER (WHERE NOT ((user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%') AND user_agent NOT LIKE '%Safari/%')) AS users_web
          FROM users
          WHERE last_activity >= NOW() - INTERVAL '5 minutes'
        )
      SELECT
        (SELECT row_to_json(visitor_stats) FROM visitor_stats) AS visitors,
        (SELECT row_to_json(user_stats) FROM user_stats) AS users,
        (SELECT COALESCE(json_agg(countries), '[]') FROM countries) AS countries,
        (SELECT COALESCE(json_agg(cities), '[]') FROM cities) AS cities,
        (SELECT COALESCE(json_agg(devices), '[]') FROM devices) AS devices,
        (SELECT COALESCE(json_agg(sources), '[]') FROM sources) AS sources,
        (SELECT COALESCE(json_agg(mediums), '[]') FROM mediums) AS mediums,
        (SELECT COALESCE(json_agg(campaigns), '[]') FROM campaigns) AS campaigns,
        (SELECT COALESCE(json_agg(referrers), '[]') FROM referrers) AS referrers,
        (SELECT COALESCE(json_agg(platforms), '[]') FROM platforms) AS platforms,
        (SELECT row_to_json(online_stats) FROM online_stats) AS online
    `);

    res.json(stats);
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// -- GET /api/admin/online-history ------------------------
router.get('/online-history', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ snapshots: [] });

  try {
    const hours = Math.min(48, Math.max(1, parseInt(req.query.hours, 10) || 24));
    const { rows } = await pool.query(
      `SELECT ts, visitors_online, users_online, users_web, users_ios
       FROM online_snapshots
       WHERE ts >= NOW() - INTERVAL '1 hour' * $1
       ORDER BY ts ASC`,
      [hours]
    );
    res.json({ snapshots: rows });
  } catch (err) {
    console.error('[admin] online-history error:', err.message);
    res.status(500).json({ error: 'Failed to load online history' });
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
                         utm_source, utm_medium, utm_campaign, utm_content, referrer, created_at, last_activity
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
    const platform = (req.query.platform || '').trim().toLowerCase();

    let where = 'WHERE u.deleted_at IS NULL';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (LOWER(u.email) LIKE $${params.length} OR LOWER(u.display_name) LIKE $${params.length})`;
    }

    if (platform === 'ios') {
      where += ` AND (u.user_agent LIKE '%iPhone%' OR u.user_agent LIKE '%iPad%') AND u.user_agent NOT LIKE '%Safari/%'`;
    } else if (platform === 'web') {
      where += ` AND (u.user_agent IS NULL OR NOT ((u.user_agent LIKE '%iPhone%' OR u.user_agent LIKE '%iPad%') AND u.user_agent NOT LIKE '%Safari/%'))`;
    }

    const countQuery = `SELECT COUNT(*) AS total FROM users u ${where}`;
    const dataQuery = `
      SELECT u.id, u.email, u.display_name, u.auth_provider, u.country, u.city,
             u.device_type, u.user_agent, u.created_at, u.last_activity,
             u.referred_by, u.ts_click_id,
             COALESCE(u.utm_source, fv.utm_source) AS utm_source,
             COALESCE(u.utm_medium, fv.utm_medium) AS utm_medium,
             COALESCE(u.utm_campaign, fv.utm_campaign) AS utm_campaign,
             ref.email AS referrer_email,
             s.plan AS sub_plan, s.status AS sub_status,
             cc.companion_count, mc.message_count
      FROM users u
      LEFT JOIN users ref ON ref.id = u.referred_by
      LEFT JOIN LATERAL (
        SELECT utm_source, utm_medium, utm_campaign FROM visitors
        WHERE ip_address = u.ip_address ORDER BY created_at ASC LIMIT 1
      ) fv ON true
      LEFT JOIN LATERAL (
        SELECT plan, status FROM subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS companion_count FROM user_companions WHERE user_id = u.id
      ) cc ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS message_count FROM messages m
        JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id
      ) mc ON true
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

// -- DELETE /api/admin/users/:id (soft delete) ------------
router.delete('/users/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET email = NULL, google_id = NULL, apple_id = NULL, telegram_id = NULL,
       deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
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

    // Invalidate content-levels caches so changes take effect immediately
    invalidateSettingsCache();

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

// -- GET /api/admin/voice/credits ----------------------------
router.get('/voice/credits', async (req, res) => {
  try {
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const [fishBalance, fishUsage] = await Promise.all([
      getFishAudioBalance(),
      getFishAudioUsage(period),
    ]);
    res.json({
      fishAudio: { balance: fishBalance, usage: fishUsage },
    });
  } catch (err) {
    console.error('[admin] voice credits error:', err.message);
    res.status(500).json({ error: 'Failed to load voice credits' });
  }
});

// -- GET /api/admin/payments (paginated) -------------------------
router.get('/payments', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0, page: 1, limit: 50 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';

    const interval = period === 'all' ? null
      : period === '7d' ? '7 days'
      : period === '90d' ? '90 days'
      : '30 days';
    const dateFilter = interval ? `WHERE created_at >= NOW() - INTERVAL '${interval}'` : '';

    const { rows: [{ count }] } = await pool.query(`
      SELECT COUNT(*) AS count FROM (
        SELECT id FROM tips ${dateFilter}
        UNION ALL
        SELECT id FROM subscriptions ${dateFilter}
      ) combined
    `);

    const { rows } = await pool.query(`
      SELECT * FROM (
        SELECT
          'tip' AS type,
          t.id,
          u.email AS user_email,
          t.amount / 100.0 AS amount_usd,
          CASE WHEN t.stripe_payment_id LIKE 'rc_%' THEN 'revenuecat' ELSE 'stripe' END AS provider,
          uc.name AS companion_name,
          t.status,
          t.created_at
        FROM tips t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN user_companions uc ON uc.id = t.companion_id
        ${dateFilter.replace('WHERE created_at', 'WHERE t.created_at')}

        UNION ALL

        SELECT
          'subscription' AS type,
          s.id,
          u.email AS user_email,
          CASE WHEN s.plan = 'yearly' THEN 99.99 ELSE 19.99 END AS amount_usd,
          COALESCE(s.payment_provider, 'stripe') AS provider,
          NULL AS companion_name,
          s.status,
          s.created_at
        FROM subscriptions s
        LEFT JOIN users u ON u.id = s.user_id
        ${dateFilter.replace('WHERE created_at', 'WHERE s.created_at')}
      ) combined
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ rows, total: parseInt(count), page, limit });
  } catch (err) {
    console.error('[admin] payments error:', err.message);
    res.status(500).json({ error: 'Failed to load payments' });
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

// -- Admin Email Inbox ----------------------------------------
const { sendEmail, ADMIN_EMAIL, ADMIN_EMAILS } = require('./email');

// GET /api/admin/emails/stats — unread count
router.get('/emails/stats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ unread: 0 });

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS unread FROM admin_emails WHERE read = false AND direction = 'inbound'`
    );
    res.json({ unread: parseInt(rows[0].unread) });
  } catch (err) {
    console.error('[admin] email stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/emails/addresses — list available send-from addresses
// Must be before /emails/:id to avoid matching "addresses" as an ID
router.get('/emails/addresses', (req, res) => {
  const names = { 'v@lovetta.ai': 'Vasily Trofimchuk', 'hello@lovetta.ai': 'Lovetta.ai Team' };
  const list = ADMIN_EMAILS.map(addr => ({ address: addr, name: names[addr] || addr }));
  res.json({ addresses: list, default: ADMIN_EMAIL });
});

// GET /api/admin/emails — paginated list
router.get('/emails', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const direction = req.query.direction || 'all';

    const dirValue = direction === 'all' ? null : (direction === 'sent' ? 'outbound' : 'inbound');
    const dirClause = dirValue ? `WHERE direction = $1` : '';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM admin_emails ${dirClause}`,
      dirValue ? [dirValue] : []
    );
    const listClause = dirValue ? `WHERE direction = $3` : '';
    const params = dirValue ? [limit, offset, dirValue] : [limit, offset];
    const { rows } = await pool.query(
      `SELECT id, direction, from_address, to_address, subject, is_marketing, forwarded, read, created_at
       FROM admin_emails ${listClause}
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    );

    res.json({ rows, total: parseInt(countRows[0].total), page, limit });
  } catch (err) {
    console.error('[admin] emails list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/emails/:id — full detail + mark as read
router.get('/emails/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { rows } = await pool.query('SELECT * FROM admin_emails WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Email not found' });

    if (!rows[0].read) {
      await pool.query('UPDATE admin_emails SET read = true WHERE id = $1', [req.params.id]);
      rows[0].read = true;
    }

    res.json({ email: rows[0] });
  } catch (err) {
    console.error('[admin] email detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/emails/send — send from admin address
router.post('/emails/send', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { to, subject, text, html, inReplyTo, from } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

    const fromAddr = from && ADMIN_EMAILS.includes(from) ? from : ADMIN_EMAIL;
    const fromNames = { 'v@lovetta.ai': 'Vasily Trofimchuk', 'hello@lovetta.ai': 'Lovetta.ai Team' };
    const fromName = fromNames[fromAddr] || 'Lovetta';

    const hdrs = {};
    if (inReplyTo) {
      hdrs['In-Reply-To'] = inReplyTo;
      hdrs['References'] = inReplyTo;
    }

    const result = await sendEmail({
      from: `${fromName} <${fromAddr}>`,
      to,
      subject,
      text: text || '',
      html: html || undefined,
      headers: Object.keys(hdrs).length ? hdrs : undefined,
    });

    // Store outbound
    await pool.query(
      `INSERT INTO admin_emails (direction, from_address, to_address, subject, body_text, body_html, message_id, in_reply_to)
       VALUES ('outbound', $1, $2, $3, $4, $5, $6, $7)`,
      [fromAddr, to, subject, text || '', html || '', result.id || null, inReplyTo || null]
    );

    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[admin] email send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- Companion Emails (girl ↔ user email exchanges) --------

router.get('/companion-emails', async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    let whereClause = '';
    const params = [limit, offset];
    if (search) {
      whereClause = `WHERE u.email ILIKE $3 OR uc.name ILIKE $3 OR ce.body_text ILIKE $3`;
      params.push(`%${search}%`);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM companion_emails ce
      LEFT JOIN users u ON u.id = ce.user_id
      LEFT JOIN user_companions uc ON uc.id = ce.companion_id
      ${whereClause}
    `;
    const dataQuery = `
      SELECT ce.id, ce.direction, ce.from_address, ce.to_address, ce.subject,
             ce.body_text, ce.created_at,
             uc.name AS companion_name, u.email AS user_email
      FROM companion_emails ce
      LEFT JOIN user_companions uc ON uc.id = ce.companion_id
      LEFT JOIN users u ON u.id = ce.user_id
      ${whereClause}
      ORDER BY ce.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const [{ rows: [{ total }] }, { rows }] = await Promise.all([
      pool.query(countQuery, search ? [params[2]] : []),
      pool.query(dataQuery, params),
    ]);

    res.json({ rows, total: parseInt(total), page, limit });
  } catch (err) {
    console.error('[admin] companion-emails error:', err.message);
    res.status(500).json({ error: 'Failed to load companion emails' });
  }
});

// -- GET /api/admin/cashouts (paginated) ------------------
router.get('/cashouts', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0, pendingCount: 0 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const status = (req.query.status || '').trim();

    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE rp.status = $1';
    }

    const countQuery = `SELECT COUNT(*) AS total FROM referral_payouts rp ${where}`;
    const pendingQuery = `SELECT COUNT(*) AS cnt FROM referral_payouts WHERE status = 'pending'`;
    const dataQuery = `
      SELECT rp.id, rp.amount, rp.method, rp.method_detail, rp.status, rp.admin_note,
             rp.created_at, rp.processed_at,
             u.email AS user_email, u.display_name AS user_name
      FROM referral_payouts rp
      JOIN users u ON u.id = rp.user_id
      ${where}
      ORDER BY rp.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, pendingResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(pendingQuery),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    res.json({
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      pendingCount: parseInt(pendingResult.rows[0].cnt, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] cashouts error:', err.message);
    res.status(500).json({ error: 'Failed to load cashouts' });
  }
});

// -- PATCH /api/admin/cashouts/:id ------------------------
router.patch('/cashouts/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { status, admin_note } = req.body || {};
    const validStatuses = ['approved', 'paid', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const processedAt = (status === 'paid' || status === 'rejected') ? 'NOW()' : 'NULL';
    await pool.query(
      `UPDATE referral_payouts SET status = $1, admin_note = $2, processed_at = ${processedAt} WHERE id = $3`,
      [status, admin_note || null, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] cashout update error:', err.message);
    res.status(500).json({ error: 'Failed to update cashout' });
  }
});

// ── Support Chat Admin ──────────────────────────────────────────────────────

router.get('/support/stats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM support_chats GROUP BY status`
    );
    const stats = { open: 0, waiting: 0, resolved: 0 };
    for (const r of rows) stats[r.status] = r.count;
    const unread = await pool.query(
      `SELECT COALESCE(SUM(unread_by_admin), 0)::int AS total FROM support_chats`
    );
    res.json({ ...stats, totalUnread: unread.rows[0].total });
  } catch (err) {
    console.error('[admin] support stats error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/support/chats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const statusFilter = req.query.status;
    const where = statusFilter ? `WHERE sc.status = $1` : '';
    const params = statusFilter ? [statusFilter] : [];
    const { rows } = await pool.query(`
      SELECT sc.*, u.email AS user_email, u.display_name AS user_name,
        (SELECT content FROM support_messages sm WHERE sm.chat_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM support_messages sm WHERE sm.chat_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message_at
      FROM support_chats sc
      LEFT JOIN users u ON u.id = sc.user_id
      ${where}
      ORDER BY sc.updated_at DESC
    `, params);
    res.json({ chats: rows });
  } catch (err) {
    console.error('[admin] support chats error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/support/chats/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    const { rows: chats } = await pool.query(
      `SELECT sc.*, u.email AS user_email, u.display_name AS user_name
       FROM support_chats sc LEFT JOIN users u ON u.id = sc.user_id WHERE sc.id = $1`,
      [chatId]
    );
    if (!chats.length) return res.status(404).json({ error: 'Chat not found' });
    await pool.query(`UPDATE support_chats SET unread_by_admin = 0 WHERE id = $1`, [chatId]);
    const msgs = await pool.query(
      `SELECT * FROM support_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );
    res.json({ chat: chats[0], messages: msgs.rows });
  } catch (err) {
    console.error('[admin] support chat detail error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/support/chats/:id/reply', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    const { rows: chats } = await pool.query(`SELECT id FROM support_chats WHERE id = $1`, [chatId]);
    if (!chats.length) return res.status(404).json({ error: 'Chat not found' });
    const msg = await pool.query(
      `INSERT INTO support_messages (chat_id, content, sender_type) VALUES ($1, $2, 'admin') RETURNING *`,
      [chatId, content.trim()]
    );
    await pool.query(
      `UPDATE support_chats SET status = 'waiting', unread_by_admin = 0, unread_by_user = unread_by_user + 1, updated_at = NOW() WHERE id = $1`,
      [chatId]
    );
    res.json({ message: msg.rows[0] });
  } catch (err) {
    console.error('[admin] support reply error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.patch('/support/chats/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    const { status } = req.body;
    if (!['open', 'waiting', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await pool.query(
      `UPDATE support_chats SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, chatId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] support status error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// -- Push Notification Testing --------------------------------

// GET /api/admin/push/status?email= — check registered push devices for a user
router.get('/push/status', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const email = (req.query.email || '').trim();
    const userId = (req.query.userId || '').trim();
    if (!email && !userId) return res.status(400).json({ error: 'email or userId required' });

    const userQuery = userId
      ? pool.query('SELECT id, email, display_name FROM users WHERE id = $1', [userId])
      : pool.query('SELECT id, email, display_name FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const { rows: users } = await userQuery;
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    const [apns, web] = await Promise.all([
      pool.query('SELECT device_token, created_at FROM apns_subscriptions WHERE user_id = $1', [user.id]),
      pool.query('SELECT endpoint, created_at FROM push_subscriptions WHERE user_id = $1', [user.id]),
    ]);

    res.json({
      user: { id: user.id, email: user.email, name: user.display_name },
      apns: apns.rows,
      web: web.rows.map(r => ({ endpoint: r.endpoint.slice(0, 80) + '…', created_at: r.created_at })),
    });
  } catch (err) {
    console.error('[admin] push status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/push/test — send a test push notification
router.post('/push/test', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { email, userId, title, body, url } = req.body || {};
    if (!email && !userId) return res.status(400).json({ error: 'email or userId required' });

    const userQuery = userId
      ? pool.query('SELECT id, email FROM users WHERE id = $1', [userId])
      : pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const { rows: users } = await userQuery;
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    const { sendPushNotification } = require('./push');
    await sendPushNotification(user.id, {
      title: title || 'Lovetta Test',
      body: body || 'Push notifications are working! 🎉',
      url: url || '/my/',
    });

    // Check how many devices were targeted
    const [apns, web] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM apns_subscriptions WHERE user_id = $1', [user.id]),
      pool.query('SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1', [user.id]),
    ]);

    res.json({
      ok: true,
      user: user.email,
      devices: { apns: apns.rows[0].count, web: web.rows[0].count },
    });
  } catch (err) {
    console.error('[admin] push test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- GET /api/admin/feedback --------------------------------
router.get('/feedback', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0 });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  const ratingFilter = req.query.rating ? parseInt(req.query.rating) : null;

  try {
    const where = ratingFilter ? 'WHERE f.rating = $3' : '';
    const params = ratingFilter ? [limit, offset, ratingFilter] : [limit, offset];

    const [countRes, dataRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM app_feedback f ${where}`,
        ratingFilter ? [ratingFilter] : []
      ),
      pool.query(
        `SELECT f.id, f.rating, f.feedback, f.created_at,
                u.email AS user_email, u.display_name
         FROM app_feedback f
         LEFT JOIN users u ON u.id = f.user_id
         ${where}
         ORDER BY f.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
    ]);

    const avgRes = await pool.query('SELECT ROUND(AVG(rating), 1) AS avg FROM app_feedback');

    res.json({
      rows: dataRes.rows,
      total: countRes.rows[0].total,
      page,
      limit,
      avgRating: parseFloat(avgRes.rows[0].avg) || 0,
    });
  } catch (err) {
    console.error('[admin] feedback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- POST /api/admin/digest/send (manual trigger) -----------
router.post('/digest/send', async (req, res) => {
  try {
    const { sendDailyDigest } = require('./daily-digest');
    await sendDailyDigest();
    res.json({ ok: true, message: 'Digest sent' });
  } catch (err) {
    console.error('[admin] digest send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- GET /api/admin/chats (list conversations) ---------------
router.get('/chats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0, page: 1, limit: 50 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    let where = '';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE (u.email ILIKE $1 OR u.display_name ILIKE $1 OR uc.name ILIKE $1)`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       JOIN user_companions uc ON uc.id = c.companion_id
       ${where}`,
      params
    );

    const dataParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT
         c.id,
         c.user_id,
         u.email AS user_email,
         u.display_name AS user_name,
         uc.name AS companion_name,
         c.last_message_at,
         c.created_at,
         (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count,
         (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       JOIN user_companions uc ON uc.id = c.companion_id
       ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({ rows, total: countRes.rows[0].total, page, limit });
  } catch (err) {
    console.error('[admin] chats list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- GET /api/admin/chats/flagged (breaking-character search) --
router.get('/chats/flagged', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ rows: [], total: 0, page: 1, limit: 50 });

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const category = (req.query.category || '').trim();
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));

    const patterns = {
      wellness: [
        'go outside', 'take a break', 'fresh air', 'screen time',
        'self.care', 'step away', 'disconnect from', 'real.world',
        'well.being', 'touch some grass',
      ],
      breaking: [
        "I'm (just )?an AI", 'as an AI', "I can't actually", "I'm not (a )?real",
        'language model', 'artificial intelligence', "I don't have (real )?feelings",
        "I'm (a )?program", "I was (designed|programmed|created) to",
      ],
      bland: [
        'mindful(ness)?', 'breath(e|ing) (deeply|slowly)', 'being present',
        'just be still', 'inner peace', 'centering (yourself|ourselves)',
        'grounding exercise', 'body scan',
      ],
    };

    // Build regex from selected or all categories
    let selectedPatterns;
    if (category && patterns[category]) {
      selectedPatterns = patterns[category];
    } else {
      selectedPatterns = [].concat(patterns.wellness, patterns.breaking, patterns.bland);
    }
    const regex = selectedPatterns.join('|');

    const params = [regex, days, limit, offset];

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'assistant'
         AND m.content ~* $1
         AND m.created_at >= NOW() - ($2 || ' days')::INTERVAL`,
      [regex, days]
    );

    const { rows } = await pool.query(
      `SELECT
         m.id AS message_id,
         m.content,
         m.created_at,
         c.id AS conversation_id,
         c.user_id,
         u.email AS user_email,
         u.display_name AS user_name,
         uc.name AS companion_name,
         (
           SELECT json_agg(sub ORDER BY sub.created_at)
           FROM (
             SELECT role, content, created_at
             FROM messages m2
             WHERE m2.conversation_id = c.id AND m2.created_at < m.created_at
             ORDER BY m2.created_at DESC LIMIT 2
           ) sub
         ) AS context_before
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users u ON u.id = c.user_id
       JOIN user_companions uc ON uc.id = c.companion_id
       WHERE m.role = 'assistant'
         AND m.content ~* $1
         AND m.created_at >= NOW() - ($2 || ' days')::INTERVAL
       ORDER BY m.created_at DESC
       LIMIT $3 OFFSET $4`,
      params
    );

    res.json({ rows, total: countRes.rows[0].total, page, limit });
  } catch (err) {
    console.error('[admin] chats flagged error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -- GET /api/admin/chats/:id (conversation detail) -----------
router.get('/chats/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'DB not available' });

  try {
    const conversationId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = (page - 1) * limit;

    // Conversation metadata
    const { rows: convRows } = await pool.query(
      `SELECT c.id, c.user_id, c.created_at, c.last_message_at,
              u.email AS user_email, u.display_name AS user_name,
              uc.name AS companion_name, uc.personality AS companion_personality
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       JOIN user_companions uc ON uc.id = c.companion_id
       WHERE c.id = $1`,
      [conversationId]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Conversation not found' });

    const countRes = await pool.query(
      'SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1',
      [conversationId]
    );

    const { rows: messages } = await pool.query(
      `SELECT id, role, content, context_text, scene_text, media_url, media_type, is_proactive, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    res.json({
      conversation: convRows[0],
      messages,
      total: countRes.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin] chat detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
