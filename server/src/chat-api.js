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
const { buildMemoryContext, processMemory } = require('./memory');
const { parseMediaTags, generateOrReuseMedia } = require('./media-chat');

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

Response format: Always start with a brief action or emotional context in *asterisks*, then your message. Use *actions* throughout your message too for expressiveness.
Example: *leans closer with a playful smile* Hey, I was just thinking about you...

Stay in character at all times. Be engaging, expressive, and emotionally present. Remember details the user shares.

MEDIA MESSAGES:
You can send photos and short videos of yourself.
- To send a photo, include: [SEND_IMAGE: brief scene/pose description]
- To send a video, include: [SEND_VIDEO: brief motion description]
- Place the tag on its own line at the END of your message, after your text.
- Send media when: user asks for a photo/selfie/video, or when flirting naturally calls for it.
- Do NOT send media in every message. Only when it fits naturally or is requested.
- The description should describe the scene, pose, and setting — NOT your physical appearance.
- Example: *bites lip playfully* Want to see what I'm wearing right now?
[SEND_IMAGE: sitting on bed in a lace nightgown, soft bedroom lighting, looking at camera with a playful smile]`;
}

function parseContextText(text) {
  let sceneText = null;
  let remaining = text;

  // Extract [scene: ...] if present (anywhere in text — model may put stray text before it)
  const sceneMatch = remaining.match(/\[scene:\s*([^\]]+)\]\s*/i);
  if (sceneMatch) {
    sceneText = sceneMatch[1].trim();
    remaining = remaining.replace(sceneMatch[0], '').trim();
  }

  // Extract leading *action*
  const match = remaining.match(/^\*([^*]+)\*/);
  const contextText = match ? match[1].trim() : null;
  const content = match ? remaining.slice(match[0].length).trim() : remaining;

  return { sceneText, contextText, content };
}

async function generateScene(companion, messageContent) {
  try {
    const { chatCompletion } = require('./ai');
    const result = await chatCompletion(
      `Write a brief cinematic scene description (max 15 words). Describe setting and mood. Third person, no quotes, no brackets. Just one short sentence.

Examples:
- Warm golden light spills across the sheets as she stretches lazily
- Rain patters against the window, a mug of tea in her hands
- She leans against the kitchen counter, barefoot on cool tiles`,
      [{ role: 'user', content: `Character: ${companion.name}, ${companion.age}. ${companion.personality}\n\nHer message: ${messageContent}` }],
      { model: 'thedrummer/rocinante-12b' }
    );
    // Clean up — remove any accidental quotes, brackets, or "Scene:" prefix
    return result.content.replace(/^["'\[\(]|["'\]\)]$/g, '').replace(/^scene:\s*/i, '').trim();
  } catch (err) {
    console.warn('[chat] scene generation failed:', err.message);
    return null;
  }
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
      `SELECT id, role, content, context_text, scene_text, media_url, media_type, created_at
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

    // Load recent messages for context (last 10 — room for memory context)
    const { rows: recentMessages } = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));

    // Build system prompt with memory context
    const basePrompt = buildCompanionSystemPrompt(companion);
    const memoryContext = await buildMemoryContext(conversation.id);
    const systemPrompt = basePrompt + memoryContext;
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
      // Parse media tags before sending text to client
      const { cleanText, mediaRequest } = parseMediaTags(aiResult.content);
      fullText = cleanText;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: cleanText })}\n\n`);

      const parsed = parseContextText(cleanText);

      // ~30% chance to generate a scene description
      if (!parsed.sceneText && Math.random() < 0.3) {
        parsed.sceneText = await generateScene(companion, parsed.content);
      }

      // Handle media generation if LLM requested it
      let mediaUrl = null;
      let mediaType = null;
      if (mediaRequest && !aborted) {
        res.write(`data: ${JSON.stringify({ type: 'media_loading', mediaType: mediaRequest.type })}\n\n`);

        const mediaHeartbeat = setInterval(() => {
          if (!aborted) { try { res.write(': heartbeat\n\n'); } catch {} }
        }, 3000);

        try {
          const mediaResult = await generateOrReuseMedia(companion, mediaRequest, {
            userId: req.userId,
            companionId: companion.id,
            platform,
          });
          if (mediaResult) {
            mediaUrl = mediaResult.url;
            mediaType = mediaResult.type;
          }
        } catch (err) {
          console.error('[chat] media generation failed:', err.message);
        } finally {
          clearInterval(mediaHeartbeat);
        }
      }

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type)
         VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText, mediaUrl, mediaType]
      );

      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversation.id]
      );

      // Fire-and-forget email notification
      maybeNotifyUser(pool, req.userId, companion, conversation.id, cleanText);

      // Fire-and-forget memory processing (fact extraction + summarization)
      processMemory(pool, conversation.id, companion.id, req.userId).catch(err => {
        console.warn('[memory] processing error:', err.message);
      });

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        sceneText: parsed.sceneText,
        mediaUrl,
        mediaType,
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
       ORDER BY created_at DESC LIMIT 10`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: '[The user hasn\'t said anything yet. Reach out naturally — share something on your mind, ask how their day is going, or flirt playfully.]' },
    ];

    const basePrompt = buildCompanionSystemPrompt(companion);
    const memoryContext = await buildMemoryContext(conversation.id);
    const systemPrompt = basePrompt + memoryContext;
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
      // Parse media tags from the full assembled text
      const { cleanText, mediaRequest } = parseMediaTags(doneData.fullText);
      const parsed = parseContextText(cleanText);

      // ~30% chance to generate a scene description
      if (!parsed.sceneText && Math.random() < 0.3) {
        parsed.sceneText = await generateScene(companion, parsed.content);
      }

      // Handle media generation if LLM requested it
      let mediaUrl = null;
      let mediaType = null;
      if (mediaRequest && !aborted) {
        res.write(`data: ${JSON.stringify({ type: 'media_loading', mediaType: mediaRequest.type })}\n\n`);

        const mediaHeartbeat = setInterval(() => {
          if (!aborted) { try { res.write(': heartbeat\n\n'); } catch {} }
        }, 3000);

        try {
          const mediaResult = await generateOrReuseMedia(companion, mediaRequest, {
            userId: req.userId,
            companionId: companion.id,
            platform,
          });
          if (mediaResult) {
            mediaUrl = mediaResult.url;
            mediaType = mediaResult.type;
          }
        } catch (err) {
          console.error('[chat] media generation failed:', err.message);
        } finally {
          clearInterval(mediaHeartbeat);
        }
      }

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type)
         VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText, mediaUrl, mediaType]
      );
      await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

      // Fire-and-forget email notification
      maybeNotifyUser(pool, req.userId, companion, conversation.id, cleanText);

      // Fire-and-forget memory processing
      processMemory(pool, conversation.id, companion.id, req.userId).catch(err => {
        console.warn('[memory] processing error:', err.message);
      });

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        sceneText: parsed.sceneText,
        mediaUrl,
        mediaType,
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

// -- POST /api/chat/:companionId/request-media ----------------
router.post('/:companionId/request-media', authenticate, async (req, res) => {
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
       ORDER BY created_at DESC LIMIT 10`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: '[The user tapped the photo button. Send them a flirty photo with a playful message. You MUST include a [SEND_IMAGE: ...] tag.]' },
    ];

    const basePrompt = buildCompanionSystemPrompt(companion);
    const memoryContext = await buildMemoryContext(conversation.id);
    const systemPrompt = basePrompt + memoryContext;
    const platform = detectPlatform(req);

    res.write(`data: ${JSON.stringify({ type: 'typing' })}\n\n`);

    const heartbeat = setInterval(() => {
      if (!aborted) { try { res.write(': heartbeat\n\n'); } catch {} }
    }, 3000);

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
      const { cleanText, mediaRequest } = parseMediaTags(aiResult.content);
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: cleanText })}\n\n`);

      const parsed = parseContextText(cleanText);

      let mediaUrl = null;
      let mediaType = null;

      // Force image generation even if LLM didn't include the tag
      const effectiveMediaRequest = mediaRequest || { type: 'image', description: 'a casual selfie, looking at camera with a warm smile' };

      if (!aborted) {
        res.write(`data: ${JSON.stringify({ type: 'media_loading', mediaType: effectiveMediaRequest.type })}\n\n`);

        const mediaHeartbeat = setInterval(() => {
          if (!aborted) { try { res.write(': heartbeat\n\n'); } catch {} }
        }, 3000);

        try {
          const mediaResult = await generateOrReuseMedia(companion, effectiveMediaRequest, {
            userId: req.userId,
            companionId: companion.id,
            platform,
          });
          if (mediaResult) {
            mediaUrl = mediaResult.url;
            mediaType = mediaResult.type;
          }
        } catch (err) {
          console.error('[chat] media generation failed:', err.message);
        } finally {
          clearInterval(mediaHeartbeat);
        }
      }

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type)
         VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText || null, mediaUrl, mediaType]
      );
      await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        sceneText: parsed.sceneText || null,
        mediaUrl,
        mediaType,
        shouldRequestTip: aiResult.shouldRequestTip || false,
      })}\n\n`);
    }
  } catch (err) {
    console.error('[chat] request-media error:', err.message);
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
      query = `SELECT id, role, content, context_text, scene_text, media_url, media_type, created_at
               FROM messages WHERE conversation_id = $1 AND created_at < (SELECT created_at FROM messages WHERE id = $2)
               ORDER BY created_at DESC LIMIT 50`;
      params = [conversation.id, before];
    } else {
      query = `SELECT id, role, content, context_text, scene_text, media_url, media_type, created_at
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
