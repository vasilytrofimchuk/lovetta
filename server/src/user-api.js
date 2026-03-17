/**
 * User API — preferences management.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { detectPlatform } = require('./content-levels');

const router = Router();

// -- GET /api/user/preferences --------------------------------
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT notify_new_messages, explicit_content FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );

    // Default explicit_content based on platform: ON for web, OFF for appstore/telegram
    const platform = detectPlatform(req);
    const defaultExplicit = platform === 'web';

    res.json({
      notify_new_messages: rows[0]?.notify_new_messages ?? false,
      explicit_content: rows[0]?.explicit_content ?? defaultExplicit,
    });
  } catch (err) {
    console.error('[user] preferences error:', err.message);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// -- PUT /api/user/preferences --------------------------------
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { notify_new_messages, explicit_content } = req.body || {};
    const pool = getPool();

    // Build dynamic SET clause — only update fields that are provided
    const updates = {};
    if (notify_new_messages !== undefined) updates.notify_new_messages = Boolean(notify_new_messages);
    if (explicit_content !== undefined) updates.explicit_content = Boolean(explicit_content);

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

module.exports = router;
