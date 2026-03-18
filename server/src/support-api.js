/**
 * Support Chat API — user-facing endpoints.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');

const router = Router();

// GET /api/support/chat — get or auto-create the user's active support chat
router.get('/chat', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    let { rows } = await pool.query(
      `SELECT * FROM support_chats WHERE user_id = $1 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1`,
      [req.userId]
    );
    let chat = rows[0];
    if (!chat) {
      const ins = await pool.query(
        `INSERT INTO support_chats (user_id) VALUES ($1) RETURNING *`,
        [req.userId]
      );
      chat = ins.rows[0];
    }
    const msgs = await pool.query(
      `SELECT * FROM support_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chat.id]
    );
    res.json({ chat, messages: msgs.rows });
  } catch (err) {
    console.error('[support] chat load error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/support/chat/:id/messages — send a user message
router.post('/chat/:id/messages', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });

    // Verify ownership
    const { rows: chats } = await pool.query(
      `SELECT id FROM support_chats WHERE id = $1 AND user_id = $2`,
      [chatId, req.userId]
    );
    if (!chats.length) return res.status(404).json({ error: 'Chat not found' });

    const msg = await pool.query(
      `INSERT INTO support_messages (chat_id, content, sender_type, sender_id) VALUES ($1, $2, 'user', $3) RETURNING *`,
      [chatId, content.trim(), req.userId]
    );
    await pool.query(
      `UPDATE support_chats SET unread_by_admin = unread_by_admin + 1, status = 'open', updated_at = NOW() WHERE id = $1`,
      [chatId]
    );
    res.json({ message: msg.rows[0] });
  } catch (err) {
    console.error('[support] send error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/support/chat/:id/messages?after=N — poll for new messages
router.get('/chat/:id/messages', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });

    // Verify ownership
    const { rows: chats } = await pool.query(
      `SELECT id FROM support_chats WHERE id = $1 AND user_id = $2`,
      [chatId, req.userId]
    );
    if (!chats.length) return res.status(404).json({ error: 'Chat not found' });

    const after = parseInt(req.query.after, 10) || 0;
    const msgs = await pool.query(
      `SELECT * FROM support_messages WHERE chat_id = $1 AND id > $2 ORDER BY created_at ASC`,
      [chatId, after]
    );
    res.json({ messages: msgs.rows });
  } catch (err) {
    console.error('[support] poll error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
