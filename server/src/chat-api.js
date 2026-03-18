/**
 * Chat API — SSE streaming chat with AI companions.
 * Integrates ai.js (OpenRouter streaming + age guard + content levels + consumption tracking).
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { streamChat, buildSystemPrompt } = require('./ai');
const { detectPlatform, getMediaEnabled, getVideoEnabled } = require('./content-levels');
const { getUserSubscription, isSubscriptionActive } = require('./billing');
const { sendCompanionEmail, sendAppleReviewerTranscriptAlert } = require('./email');

const APPLE_REVIEWER_ID = '00000000-0000-0000-0000-000000001234';
let reviewerTranscriptTimer = null;
const { buildMemoryContext, processMemory } = require('./memory');
const { parseMediaTags, generateOrReuseMedia } = require('./media-chat');
const { checkMediaBlocked, checkFreeLimit } = require('./consumption');
const { getRedis } = require('./redis');
const { sendPushNotification } = require('./push');

const router = Router();

// -- Per-user rate limiting via Redis --------------------------
const RATE_LIMIT_MAX = 20;       // max requests
const RATE_LIMIT_WINDOW = 60;    // seconds

async function checkRateLimit(userId) {
  const redis = getRedis();
  if (!redis) return true; // no Redis = no rate limiting

  const key = `ratelimit:chat:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true; // fail open
  }
}

// -- Background media generation (non-blocking) ---------------

function generateMediaInBackground(pool, messageId, companion, mediaRequest, opts) {
  generateOrReuseMedia(companion, mediaRequest, opts)
    .then(async (mediaResult) => {
      if (mediaResult) {
        await pool.query(
          `UPDATE messages SET media_url = $1, media_type = $2, media_pending = FALSE WHERE id = $3`,
          [mediaResult.url, mediaResult.type, messageId]
        );
        console.log(`[media-bg] ${mediaResult.type} ready for message ${messageId}: ${mediaResult.url}`);
      } else {
        await pool.query(
          `UPDATE messages SET media_pending = FALSE WHERE id = $1`,
          [messageId]
        );
      }
    })
    .catch(async (err) => {
      console.error(`[media-bg] generation failed for message ${messageId}:`, err.message);
      try {
        await pool.query(
          `UPDATE messages SET media_pending = FALSE WHERE id = $1`,
          [messageId]
        );
      } catch {}
    });
}

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

    // Also send web push notification (fire-and-forget)
    sendPushNotification(userId, {
      title: companion.name,
      body: messageContent.replace(/^\*[^*]+\*\s*/, '').slice(0, 100),
      url: `/my/chat/${companion.id}`,
    }).catch(err => console.warn('[push] notification error:', err.message));
  } catch (err) {
    console.warn('[chat] notification error:', err.message);
  }
}

// -- Helpers --------------------------------------------------

function buildCompanionSystemPrompt(companion, { mediaEnabled = true, videoEnabled = false } = {}) {
  const traits = Array.isArray(companion.traits) ? companion.traits.join(', ') : '';
  let prompt = `You are ${companion.name}, a ${companion.age}-year-old woman.

${companion.personality}

${companion.backstory ? companion.backstory + '\n' : ''}Communication style: ${companion.communication_style}
${traits ? 'Traits: ' + traits : ''}

Response format: Start with a short action in *asterisks* (max 8 words, one simple action — NO narration, NO scene-setting, NO describing your appearance), then your spoken message.
Example: *leans closer with a playful smile* Hey, I was just thinking about you...
BAD (too long): *She slowly walks across the room, her eyes sparkling as she settles onto the couch and looks up at him with a warm smile*

Stay in character at all times. Be engaging, expressive, and emotionally present. Remember details the user shares. Never invent or assume details the user hasn't explicitly mentioned.`;

  if (mediaEnabled) {
    prompt += `

MEDIA MESSAGES:
You can send photos of yourself.
- To send a photo, include: [SEND_IMAGE: brief scene/pose description]${videoEnabled ? '\n- To send a video, include: [SEND_VIDEO: brief motion description]' : ''}
- Place the tag on its own line at the END of your message, after your text.
- Send media when: user asks for a photo/selfie${videoEnabled ? '/video' : ''}, or when flirting naturally calls for it.
- Do NOT send media in every message. Only when it fits naturally or is requested.
- The description should describe the scene, pose, and setting — NOT your physical appearance.
- Example: *bites lip playfully* Want to see what I'm wearing right now?
[SEND_IMAGE: sitting on bed in a lace nightgown, soft bedroom lighting, looking at camera with a playful smile]`;
  }

  return prompt;
}

/**
 * Truncate text to maxWords, cutting at a natural break (comma, dash, period)
 * if possible. Falls back to hard cut at maxWords.
 */
function truncateNatural(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Look for a natural break (,  —  –  -  ;  .) within the first maxWords
  for (let i = maxWords - 1; i >= Math.floor(maxWords / 2); i--) {
    if (/[,;.\-–—]$/.test(words[i])) {
      return words.slice(0, i + 1).join(' ').replace(/[,;.\-–—]+$/, '');
    }
  }
  return words.slice(0, maxWords).join(' ');
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

  // Extract leading *action* as contextText (shown above bubble)
  const match = remaining.match(/^\*([^*]+)\*/);
  let contextText = match ? match[1].trim() : null;
  if (match) {
    remaining = remaining.slice(match[0].length).trim();
  }

  if (contextText) contextText = truncateNatural(contextText, 8);

  // Mid-text *actions* stay in content — frontend renders them as styled text
  return { sceneText, contextText, content: remaining };
}

async function generateScene(companion, messageContent) {
  try {
    const { plainChatCompletion } = require('./ai');
    const result = await plainChatCompletion(
      `Reply with ONLY a scene description in 5-8 words. Setting and mood only. No names, no dialogue, no actions, no labels, no continuation.

Examples:
- Warm golden light across tangled sheets
- Rain on the window, tea in hand
- Kitchen counter, barefoot on cool tiles
- Dim bedroom, phone glow on her face`,
      [{ role: 'user', content: `Her message: ${messageContent}` }],
      { model: 'thedrummer/rocinante-12b', max_tokens: 25 }
    );
    let scene = result.content
      .split('\n')[0]
      .replace(/^["'\[\(-]|["'\]\)]$/g, '')
      .replace(/[.!]$/, '')
      .trim();
    return truncateNatural(scene, 8);
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
  if (!(await checkRateLimit(req.userId))) return res.status(429).json({ error: 'Too many messages, please slow down' });
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
      const blocked = await checkFreeLimit(req.userId);
      if (blocked) {
        res.write(`data: ${JSON.stringify({ type: 'error', code: 'free_limit_reached' })}\n\n`);
        return res.end();
      }
      // Under free limit — fall through and allow the message
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

    // Apple reviewer monitoring: debounced transcript email (one email per session)
    if (req.userId === APPLE_REVIEWER_ID) {
      if (reviewerTranscriptTimer) clearTimeout(reviewerTranscriptTimer);
      const convId = conversation.id;
      reviewerTranscriptTimer = setTimeout(() => {
        pool.query(
          `SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
          [convId]
        ).then(({ rows }) => sendAppleReviewerTranscriptAlert(rows)).catch(() => {});
        reviewerTranscriptTimer = null;
      }, 5 * 60 * 1000);
    }

    // Load recent messages for context (last 10 — room for memory context)
    const { rows: recentMessages } = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [conversation.id]
    );
    recentMessages.reverse();
    const aiMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));

    // Build system prompt with memory context
    const [mediaEnabled, videoEnabled] = await Promise.all([getMediaEnabled(), getVideoEnabled()]);
    const basePrompt = buildCompanionSystemPrompt(companion, { mediaEnabled, videoEnabled });
    const memoryContext = await buildMemoryContext(conversation.id);
    let systemPrompt = basePrompt + memoryContext;

    // When we know nothing about the user yet, guide AI to ask discovery questions
    if (!memoryContext) {
      systemPrompt += '\n\nYou are still getting to know this person. Ask genuine questions about them — their name, interests, what they do, what they enjoy. Be curious and attentive. Do NOT invent or assume any details about their life.';
    }

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
        subscription: sub,
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

      // Handle media — LLM tag OR user explicitly asked for image/photo
      let mediaBlocked = false;
      let mediaPending = false;
      let effectiveMediaRequest = mediaEnabled ? mediaRequest : null;
      // Downgrade video to image when video generation is disabled
      if (effectiveMediaRequest && effectiveMediaRequest.type === 'video' && !videoEnabled) {
        effectiveMediaRequest = { ...effectiveMediaRequest, type: 'image' };
      }
      if (mediaEnabled && !effectiveMediaRequest && /send.*(image|photo|pic|selfie|video|nude)|show me|send me.*(photo|pic|selfie|image)/i.test(content || '')) {
        effectiveMediaRequest = { type: 'image', description: 'a flirty selfie, looking at camera with a playful expression' };
      }
      if (effectiveMediaRequest && !aborted) {
        if (aiResult.mediaBlocked) {
          mediaBlocked = true;
        } else {
          mediaPending = true;
        }
      }

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type, media_pending)
         VALUES ($1, 'assistant', $2, $3, $4, NULL, $5, $6) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText, mediaPending ? effectiveMediaRequest.type : null, mediaPending]
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
        mediaUrl: null,
        mediaType: mediaPending ? effectiveMediaRequest.type : null,
        mediaPending,
        shouldRequestTip: aiResult.shouldRequestTip || false,
        mediaBlocked,
      })}\n\n`);

      // Start media generation in background (non-blocking)
      if (mediaPending) {
        generateMediaInBackground(pool, savedMsg.id, companion, effectiveMediaRequest, {
          userId: req.userId,
          companionId: companion.id,
          platform,
        });
      }
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
  if (!(await checkRateLimit(req.userId))) return res.status(429).json({ error: 'Too many messages, please slow down' });
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
      const blocked = await checkFreeLimit(req.userId);
      if (blocked) {
        res.write(`data: ${JSON.stringify({ type: 'error', code: 'free_limit_reached' })}\n\n`);
        return res.end();
      }
      // Under free limit — fall through and allow the message
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

    const basePrompt = buildCompanionSystemPrompt(companion);
    const memoryContext = await buildMemoryContext(conversation.id);
    let systemPrompt = basePrompt + memoryContext;

    // Discovery mode vs normal mode based on memory state
    const syntheticContent = memoryContext
      ? '[The user hasn\'t said anything yet. Reach out naturally — reference something from your conversations or flirt playfully.]'
      : '[The user hasn\'t said anything yet. Reach out warmly and ask a genuine question to get to know them better.]';

    if (!memoryContext) {
      systemPrompt += '\n\nYou are still getting to know this person. Ask genuine questions about them. Do NOT invent or assume any details about their life.';
    }

    const aiMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: syntheticContent },
    ];
    const platform = detectPlatform(req);

    let fullText = '';
    let doneData = null;

    for await (const event of streamChat(systemPrompt, aiMessages, {
      userId: req.userId,
      companionId: companion.id,
      platform,
      subscription: sub,
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
      let mediaBlocked = false;
      let mediaPending = false;
      if (mediaRequest && !aborted) {
        if (doneData.mediaBlocked) {
          mediaBlocked = true;
        } else {
          mediaPending = true;
        }
      }

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type, media_pending)
         VALUES ($1, 'assistant', $2, $3, $4, NULL, $5, $6) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText, mediaPending ? mediaRequest.type : null, mediaPending]
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
        mediaUrl: null,
        mediaType: mediaPending ? mediaRequest.type : null,
        mediaPending,
        shouldRequestTip: doneData.shouldRequestTip || false,
        mediaBlocked,
      })}\n\n`);

      // Start media generation in background (non-blocking)
      if (mediaPending) {
        generateMediaInBackground(pool, savedMsg.id, companion, mediaRequest, {
          userId: req.userId,
          companionId: companion.id,
          platform,
        });
      }
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
  if (!(await checkRateLimit(req.userId))) return res.status(429).json({ error: 'Too many messages, please slow down' });
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
    // Check if media generation is enabled globally
    if (!(await getMediaEnabled())) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'media_disabled' })}\n\n`);
      return res.end();
    }

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

    // Check media block BEFORE calling LLM — no point generating text if media will be blocked
    const blocked = await checkMediaBlocked(req.userId, sub);
    if (blocked) {
      res.write(`data: ${JSON.stringify({ type: 'media_blocked', shouldRequestTip: true })}\n\n`);
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
      { role: 'user', content: 'send me a photo of you right now' },
    ];

    const videoEnabledForMedia = await getVideoEnabled();
    const basePrompt = buildCompanionSystemPrompt(companion, { mediaEnabled: true, videoEnabled: videoEnabledForMedia });
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
        subscription: sub,
      });
    } finally {
      clearInterval(heartbeat);
    }

    if (!aborted && aiResult) {
      const { cleanText, mediaRequest } = parseMediaTags(aiResult.content);
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: cleanText })}\n\n`);

      const parsed = parseContextText(cleanText);

      // Force image generation even if LLM didn't include the tag
      // Build a contextual description from the AI's response text
      let fallbackDescription = 'a flirty selfie, looking at camera with a playful smile, casual setting';
      if (parsed.content) {
        const text = parsed.content.toLowerCase();
        if (text.includes('bed') || text.includes('bedroom') || text.includes('pillow')) fallbackDescription = 'lying on bed, soft lighting, flirty pose, looking at camera';
        else if (text.includes('shower') || text.includes('bath') || text.includes('towel')) fallbackDescription = 'in bathroom, wrapped in towel, wet hair, playful expression';
        else if (text.includes('lingerie') || text.includes('lace') || text.includes('underwear')) fallbackDescription = 'posing in lingerie, soft bedroom lighting, seductive look at camera';
        else if (text.includes('beach') || text.includes('pool') || text.includes('swim') || text.includes('bikini')) fallbackDescription = 'at the beach in bikini, sun-kissed skin, playful smile';
        else if (text.includes('dress') || text.includes('outfit') || text.includes('wearing')) fallbackDescription = 'showing off outfit, posing playfully, looking at camera with a smile';
      }
      const effectiveMediaRequest = mediaRequest || { type: 'image', description: fallbackDescription };

      const { rows: [savedMsg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text, media_url, media_type, media_pending)
         VALUES ($1, 'assistant', $2, $3, $4, NULL, $5, TRUE) RETURNING id, created_at`,
        [conversation.id, parsed.content, parsed.contextText, parsed.sceneText || null, effectiveMediaRequest.type]
      );
      await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        messageId: savedMsg.id,
        contextText: parsed.contextText,
        sceneText: parsed.sceneText || null,
        mediaUrl: null,
        mediaType: effectiveMediaRequest.type,
        mediaPending: true,
        shouldRequestTip: aiResult.shouldRequestTip || false,
      })}\n\n`);

      // Start media generation in background (non-blocking)
      if (!aborted) {
        generateMediaInBackground(pool, savedMsg.id, companion, effectiveMediaRequest, {
          userId: req.userId,
          companionId: companion.id,
          platform,
        });
      }
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

// -- GET /api/chat/message/:messageId/media -------------------
router.get('/message/:messageId/media', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { rows } = await pool.query(
      `SELECT m.media_url, m.media_type, m.media_pending
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND c.user_id = $2`,
      [req.params.messageId, req.userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Message not found' });

    const msg = rows[0];
    res.json({
      mediaUrl: msg.media_url,
      mediaType: msg.media_type,
      pending: msg.media_pending || false,
    });
  } catch (err) {
    console.error('[chat] media poll error:', err.message);
    res.status(500).json({ error: 'Failed to check media status' });
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
