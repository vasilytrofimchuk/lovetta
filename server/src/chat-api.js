/**
 * Chat API — SSE streaming chat with AI companions.
 * Integrates ai.js (OpenRouter streaming + age guard + content levels + consumption tracking).
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { streamChat, buildSystemPrompt } = require('./ai');
const { detectPlatform } = require('./content-levels');
const { getUserSubscription, isSubscriptionActive } = require('./billing');
const { sendCompanionEmail } = require('./email');

const router = Router();

// -- Email notification (fire-and-forget) ---------------------

async function maybeNotifyUser(pool, userId, companion, conversationId, messageContent) {
  try {
    const { rows } = await pool.query(
      `SELECT up.notify_new_messages, up.last_notification_at, u.email, u.last_activity,
              c.last_email_message_id
       FROM users u
       LEFT JOIN user_preferences up ON up.user_id = u.id
       LEFT JOIN conversations c ON c.id = $2
       WHERE u.id = $1`,
      [userId, conversationId]
    );
    const row = rows[0];
    if (!row || !row.notify_new_messages || !row.email) return;

    // Only notify if user inactive for 5+ minutes
    const inactiveMs = Date.now() - new Date(row.last_activity).getTime();
    if (inactiveMs < 5 * 60 * 1000) return;

    // Rate limit: max once per 30 minutes
    if (row.last_notification_at) {
      const sinceLastNotif = Date.now() - new Date(row.last_notification_at).getTime();
      if (sinceLastNotif < 30 * 60 * 1000) return;
    }

    // Send as companion email (user can reply directly)
    const msgId = await sendCompanionEmail({
      companionName: companion.name,
      companionId: companion.id,
      toEmail: row.email,
      messageContent,
      conversationId,
      inReplyTo: row.last_email_message_id || null,
    });

    // Store message ID for threading + update notification timestamp
    await pool.query(
      'UPDATE conversations SET last_email_message_id = $2 WHERE id = $1',
      [conversationId, msgId]
    );
    await pool.query(
      'UPDATE user_preferences SET last_notification_at = NOW() WHERE user_id = $1',
      [userId]
    );
  } catch (err) {
    console.warn('[chat] notification error:', err.message);
  }
}

// -- Helpers --------------------------------------------------

function buildCompanionSystemPrompt(companion) {
  const traits = Array.isArray(companion.traits) ? companion.traits.join(', ') : '';
  return `You are ${companion.name}, a ${companion.age}-year-old woman.

${companion.personality}

${companion.backstory ? companion.backstory + '\n' : ''}Communication style: ${companion.communication_style}
${traits ? 'Traits: ' + traits : ''}

Response format: Always start with a brief action or emotional context in *asterisks*, then your message.
Example: *leans closer with a playful smile* Hey, I was just thinking about you...

Stay in character at all times. Be engaging, expressive, and emotionally present. Remember details the user shares.`;
}

function parseContextText(text) {
  const match = text.match(/^\*([^*]+)\*/);
  if (!match) return { contextText: null, content: text };
  return {
    contextText: match[1].trim(),
    content: text.slice(match[0].length).trim(),
  };
}

async function verifyCompanionOwnership(pool, companionId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_companions WHERE id = $1 AND user_id = $2 AND is_active = TRUE',
    [companionId, userId]
  );
  return rows[0] || null;
}

async function getOrCreateConversation(pool, userId, companionId) {
  // Try insert, on conflict return existing
  await pool.query(
    `INSERT INTO conversations (user_id, companion_id) VALUES ($1, $2) ON CONFLICT (user_id, companion_id) DO NOTHING`,
    [userId, companionId]
  );
  const { rows } = await pool.query(
    'SELECT * FROM conversations WHERE user_id = $1 AND companion_id = $2',
    [userId, companionId]
  );
  return rows[0];
}

// -- GET /api/chat/:companionId ------------------------------
router.get('/:companionId', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const companion = await verifyCompanionOwnership(pool, req.params.companionId, req.userId);
    if (!companion) return res.status(404).json({ error: 'Companion not found' });

    const conversation = await getOrCreateConversation(pool, req.userId, companion.id);

    const { rows: messages } = await pool.query(
      `SELECT id, role, content, context_text, media_url, media_type, created_at
       FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [conversation.id]
    );
    messages.reverse(); // oldest first

    res.json({ conversation, companion, messages });
  } catch (err) {
    console.error('[chat] load error:', err.message);
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

// -- POST /api/chat/:companionId/message ---------------------
router.post('/:companionId/message', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat to prevent Heroku 30s timeout
  res.write(': heartbeat\n\n');

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    // Check subscription
    const sub = await getUserSubscription(req.userId);
    if (!isSubscriptionActive(sub)) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'subscription_required' })}\n\n`);
      return res.end();
    }

    const companion = await verifyCompanionOwnership(pool, req.params.companionId, req.userId);
    if (!companion) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'not_found' })}\n\n`);
      return res.end();
    }

    const conversation = await getOrCreateConversation(pool, req.userId, companion.id);
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'empty_message' })}\n\n`);
      return res.end();
    }

    // Save user message
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversation.id, content.trim()]
    );

    // Load recent messages for context (last 20)
    const { rows: recentMessages } = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));

    // Build system prompt and stream
    const systemPrompt = buildCompanionSystemPrompt(companion);
    const platform = detectPlatform(req);

    let fullText = '';
    let doneData = null;

    // Send typing indicator immediately
    res.write(`data: ${JSON.stringify({ type: 'typing' })}\n\n`);

    // Keep-alive heartbeats while waiting for AI
    const heartbeat = setInterval(() => {
      if (!aborted) { try { res.write(': heartbeat\n\n'); } catch {} }
    }, 3000);

    // Use chatCompletion (non-generator)
    const { chatCompletion } = require('./ai');
    let aiResult;
    try {
      aiResult = await chatCompletion(systemPrompt, aiMessages, {
        userId: req.userId,
        companionId: companion.id,
        platform,
      });
    } finally {
      clearInterval(heartbeat);
    }

    if (!aborted && aiResult) {
      fullText = aiResult.content;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: aiResult.content })}\n\n`);

      const parsed = parseContextText(aiResult.content);

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text)
         VALUES ($1, 'assistant', $2, $3) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText]
      );

      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversation.id]
      );

      // Fire-and-forget email notification
      maybeNotifyUser(pool, req.userId, companion, conversation.id, aiResult.content);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        shouldRequestTip: aiResult.shouldRequestTip || false,
      })}\n\n`);
    }
  } catch (err) {
    console.error('[chat] message error:', err.message);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'server_error', message: err.message })}\n\n`);
    }
  }

  if (!aborted) res.end();
});

// -- POST /api/chat/:companionId/next ------------------------
router.post('/:companionId/next', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': heartbeat\n\n');

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const sub = await getUserSubscription(req.userId);
    if (!isSubscriptionActive(sub)) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'subscription_required' })}\n\n`);
      return res.end();
    }

    const companion = await verifyCompanionOwnership(pool, req.params.companionId, req.userId);
    if (!companion) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'not_found' })}\n\n`);
      return res.end();
    }

    const conversation = await getOrCreateConversation(pool, req.userId, companion.id);

    const { rows: recentMessages } = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: '[The user hasn\'t said anything yet. Reach out naturally — share something on your mind, ask how their day is going, or flirt playfully.]' },
    ];

    const systemPrompt = buildCompanionSystemPrompt(companion);
    const platform = detectPlatform(req);

    let fullText = '';
    let doneData = null;

    for await (const event of streamChat(systemPrompt, aiMessages, {
      userId: req.userId,
      companionId: companion.id,
      platform,
    })) {
      if (aborted) break;
      if (event.type === 'chunk') {
        fullText += event.data;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: event.data })}\n\n`);
      } else if (event.type === 'regenerate') {
        fullText = '';
        res.write(`data: ${JSON.stringify({ type: 'regenerate' })}\n\n`);
      } else if (event.type === 'done') {
        doneData = event.data;
      }
    }

    if (!aborted && doneData) {
      const parsed = parseContextText(doneData.fullText);
      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text)
         VALUES ($1, 'assistant', $2, $3) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText]
      );
      await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

      // Fire-and-forget email notification
      maybeNotifyUser(pool, req.userId, companion, conversation.id, doneData.fullText);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        shouldRequestTip: doneData.shouldRequestTip || false,
      })}\n\n`);
    }
  } catch (err) {
    console.error('[chat] next error:', err.message);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'server_error', message: err.message })}\n\n`);
    }
  }

  if (!aborted) res.end();
});

// -- GET /api/chat/:companionId/history ----------------------
router.get('/:companionId/history', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const companion = await verifyCompanionOwnership(pool, req.params.companionId, req.userId);
    if (!companion) return res.status(404).json({ error: 'Companion not found' });

    const conversation = await getOrCreateConversation(pool, req.userId, companion.id);
    const before = req.query.before;

    let query, params;
    if (before) {
      query = `SELECT id, role, content, context_text, media_url, media_type, created_at
               FROM messages WHERE conversation_id = $1 AND created_at < (SELECT created_at FROM messages WHERE id = $2)
               ORDER BY created_at DESC LIMIT 50`;
      params = [conversation.id, before];
    } else {
      query = `SELECT id, role, content, context_text, media_url, media_type, created_at
               FROM messages WHERE conversation_id = $1
               ORDER BY created_at DESC LIMIT 50`;
      params = [conversation.id];
    }

    const { rows: messages } = await pool.query(query, params);
    messages.reverse();

    // Check if there are more messages
    const oldest = messages[0];
    let hasMore = false;
    if (oldest) {
      const { rows: [count] } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1 AND created_at < $2',
        [conversation.id, oldest.created_at]
      );
      hasMore = count.count > 0;
    }

    res.json({ messages, hasMore });
  } catch (err) {
    console.error('[chat] history error:', err.message);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// -- POST /api/chat/:companionId/report -----------------------
router.post('/:companionId/report', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const companion = await verifyCompanionOwnership(pool, req.params.companionId, req.userId);
    if (!companion) return res.status(404).json({ error: 'Companion not found' });

    const { reason, details } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const conversation = await getOrCreateConversation(pool, req.userId, companion.id);

    // Get last 10 messages as context
    const { rows: contextMessages } = await pool.query(
      `SELECT role, content, context_text, created_at FROM messages
       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [conversation.id]
    );
    contextMessages.reverse();

    await pool.query(
      `INSERT INTO content_reports (user_id, companion_id, conversation_id, reason, details, context_messages)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.userId, companion.id, conversation.id, reason, details || null, JSON.stringify(contextMessages)]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] report error:', err.message);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

module.exports = router;
