/**
 * Admin API — dashboard endpoints for monitoring.
 * All routes require ADMIN_TOKEN via Bearer header or X-Admin-Token.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { getConsumptionSummary } = require('./consumption');
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
        user_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
          FROM users
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
             s.plan AS sub_plan, s.status AS sub_status,
             rc.referral_count, re.referral_earnings
      FROM users u
      LEFT JOIN LATERAL (
        SELECT plan, status FROM subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS referral_count FROM users ref WHERE ref.referred_by = u.id
      ) rc ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(commission_amount), 0)::int AS referral_earnings FROM referral_commissions WHERE referrer_id = u.id
      ) re ON true
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

module.exports = router;
