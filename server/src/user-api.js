/**
 * User API — preferences management.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');

const router = Router();

// -- GET /api/user/preferences --------------------------------
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT notify_new_messages FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );
    res.json({
      notify_new_messages: rows[0]?.notify_new_messages ?? false,
    });
  } catch (err) {
    console.error('[user] preferences error:', err.message);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// -- PUT /api/user/preferences --------------------------------
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { notify_new_messages } = req.body || {};
    const pool = getPool();
    await pool.query(
      `INSERT INTO user_preferences (user_id, notify_new_messages, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         notify_new_messages = $2, updated_at = NOW()`,
      [req.userId, Boolean(notify_new_messages)]
    );
    res.json({ notify_new_messages: Boolean(notify_new_messages) });
  } catch (err) {
    console.error('[user] update preferences error:', err.message);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
