/**
 * User API — preferences management + push subscription.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
// content-levels import removed — explicit default is now false for all platforms
const { getVapidPublicKey } = require('./push');
const { sendEmail, ADMIN_EMAIL } = require('./email');

const router = Router();

// -- GET /api/user/vapid-key (no auth — needed before login for SW) --
router.get('/vapid-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(404).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// -- GET /api/user/preferences --------------------------------
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT notify_new_messages, explicit_content, proactive_messages, proactive_frequency, show_actions FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );

    // Default explicit_content OFF for all platforms (Google Ads compliance)
    const defaultExplicit = false;

    res.json({
      notify_new_messages: rows[0]?.notify_new_messages ?? false,
      explicit_content: rows[0]?.explicit_content ?? defaultExplicit,
      proactive_messages: rows[0]?.proactive_messages ?? true,
      proactive_frequency: rows[0]?.proactive_frequency ?? 'normal',
      show_actions: rows[0]?.show_actions ?? true,
    });
  } catch (err) {
    console.error('[user] preferences error:', err.message);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// -- PUT /api/user/preferences --------------------------------
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { notify_new_messages, explicit_content, proactive_messages, proactive_frequency, show_actions } = req.body || {};
    const pool = getPool();

    // Build dynamic SET clause — only update fields that are provided
    const updates = {};
    if (notify_new_messages !== undefined) updates.notify_new_messages = Boolean(notify_new_messages);
    if (explicit_content !== undefined) updates.explicit_content = Boolean(explicit_content);
    if (proactive_messages !== undefined) updates.proactive_messages = Boolean(proactive_messages);
    if (proactive_frequency !== undefined && ['low', 'normal', 'high'].includes(proactive_frequency)) {
      updates.proactive_frequency = proactive_frequency;
    }
    if (show_actions !== undefined) updates.show_actions = Boolean(show_actions);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No preferences to update' });
    }

    const cols = Object.keys(updates);
    const vals = Object.values(updates);
    const insertCols = ['user_id', ...cols, 'updated_at'].join(', ');
    const insertVals = ['$1', ...cols.map((_, i) => `$${i + 2}`), 'NOW()'].join(', ');
    const updateSet = cols.map((c, i) => `${c} = $${i + 2}`).join(', ') + ', updated_at = NOW()';

    await pool.query(
      `INSERT INTO user_preferences (${insertCols}) VALUES (${insertVals})
       ON CONFLICT (user_id) DO UPDATE SET ${updateSet}`,
      [req.userId, ...vals]
    );

    res.json(updates);
  } catch (err) {
    console.error('[user] update preferences error:', err.message);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// -- POST /api/user/push/subscribe ----------------------------
router.post('/push/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Missing push subscription data' });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_p256dh = $3, keys_auth = $4`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[user] push subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// -- DELETE /api/user/push/unsubscribe ------------------------
router.delete('/push/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    const pool = getPool();
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.userId, endpoint]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[user] push unsubscribe error:', err.message);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// -- POST /api/user/push/subscribe-apns (iOS native push) ----
router.post('/push/subscribe-apns', authenticate, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Missing device token' });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO apns_subscriptions (user_id, device_token)
       VALUES ($1, $2)
       ON CONFLICT (device_token) DO UPDATE SET user_id = $1`,
      [req.userId, token]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[user] apns subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save device token' });
  }
});

// -- DELETE /api/user/push/unsubscribe-apns -------------------
router.delete('/push/unsubscribe-apns', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query(
      'DELETE FROM apns_subscriptions WHERE user_id = $1',
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[user] apns unsubscribe error:', err.message);
    res.status(500).json({ error: 'Failed to remove device token' });
  }
});

// -- PUT /api/user/real-email — store user's real email (for relay/synthetic users) --
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.put('/real-email', authenticate, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const pool = getPool();

    // Check if email is already taken by another user
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
      [normalizedEmail, req.userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This email is already in use' });
    }

    await pool.query(
      'UPDATE users SET real_email = $1 WHERE id = $2',
      [normalizedEmail, req.userId]
    );

    res.json({ ok: true, real_email: normalizedEmail });
  } catch (err) {
    console.error('[user] real-email error:', err.message);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

// -- POST /api/user/app-feedback (in-app rating + optional comment) --
router.post('/app-feedback', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { rating, feedback } = req.body || {};
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    const trimmed = (feedback || '').trim().slice(0, 2000) || null;

    await pool.query(
      'INSERT INTO app_feedback (user_id, rating, feedback) VALUES ($1, $2, $3)',
      [req.userId, numRating, trimmed]
    );

    if (numRating <= 3 && trimmed) {
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `[Lovetta] App feedback: ${numRating}/5 stars`,
        html: `<p><strong>Rating:</strong> ${numRating}/5</p>
               <p><strong>User:</strong> ${req.userId}</p>
               <p><strong>Feedback:</strong></p>
               <pre>${trimmed}</pre>`,
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[user] app-feedback error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

module.exports = router;
