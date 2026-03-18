/**
 * Companion API — templates, creation, management.
 * Users create up to max_companions AI companions from templates or custom.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { chatCompletion, plainChatCompletion } = require('./ai');

function truncateNatural(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  for (let i = maxWords - 1; i >= Math.floor(maxWords / 2); i--) {
    if (/[,;.\-–—]$/.test(words[i])) {
      return words.slice(0, i + 1).join(' ').replace(/[,;.\-–—]+$/, '');
    }
  }
  return words.slice(0, maxWords).join(' ');
}

const router = Router();

// -- GET /api/companions/avatars — custom avatars with filters --
router.get('/avatars', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ avatars: [] });

  try {
    const { style, hair, skin, age, limit = 100, offset = 0 } = req.query;
    const conditions = ['is_active = TRUE'];
    const params = [];
    let idx = 1;

    if (style && style !== 'all') { conditions.push(`style = $${idx++}`); params.push(style); }
    if (hair && hair !== 'all') { conditions.push(`hair = $${idx++}`); params.push(hair); }
    if (skin && skin !== 'all') { conditions.push(`skin = $${idx++}`); params.push(skin); }
    if (age && age !== 'all') { conditions.push(`age = $${idx++}`); params.push(age); }

    params.push(Math.min(parseInt(limit) || 100, 200));
    params.push(parseInt(offset) || 0);

    const { rows } = await pool.query(
      `SELECT id, image_url, video_url, hair, skin, style, age FROM custom_avatars
       WHERE ${conditions.join(' AND ')}
       ORDER BY sort_order, id
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    res.json({ avatars: rows });
  } catch (err) {
    console.error('[companions] avatars error:', err.message);
    res.json({ avatars: [] });
  }
});

// -- POST /api/companions/avatars/:id/pick — track avatar selection --
router.post('/avatars/:id/pick', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ ok: true });
  try {
    await pool.query('UPDATE custom_avatars SET pick_count = pick_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

// -- GET /api/companions/templates/preview (public, no auth) --
router.get('/templates/preview', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ templates: [] });

  try {
    const { rows } = await pool.query(
      'SELECT name, tagline, avatar_url, video_url, age, style FROM companion_templates WHERE is_active = TRUE ORDER BY sort_order, id'
    );
    res.json({ templates: rows });
  } catch (err) {
    console.error('[companions] templates preview error:', err.message);
    res.json({ templates: [] });
  }
});

// -- GET /api/companions/templates ---------------------------
router.get('/templates', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ templates: [] });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM companion_templates WHERE is_active = TRUE ORDER BY sort_order, id'
    );
    res.json({ templates: rows });
  } catch (err) {
    console.error('[companions] templates error:', err.message);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// -- POST /api/companions ------------------------------------
router.post('/', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    // Check max_companions limit
    const { rows: settings } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'max_companions'`
    );
    const maxCompanions = parseInt(settings[0]?.value, 10) || 3;

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM user_companions WHERE user_id = $1 AND is_active = TRUE',
      [req.userId]
    );
    if (countRows[0].count >= maxCompanions) {
      return res.status(403).json({ error: `Maximum ${maxCompanions} companions allowed` });
    }

    const { templateId, name, personality, backstory, traits, communicationStyle, age, avatarUrl, videoUrl, voiceId } = req.body || {};
    let companionData;

    if (templateId) {
      // Create from template
      const { rows: templates } = await pool.query(
        'SELECT * FROM companion_templates WHERE id = $1 AND is_active = TRUE', [templateId]
      );
      if (!templates.length) return res.status(404).json({ error: 'Template not found' });
      const t = templates[0];
      companionData = {
        template_id: t.id,
        name: name || t.name,
        personality: personality || t.personality,
        backstory: backstory || t.backstory,
        avatar_url: t.avatar_url,
        video_url: t.video_url || null,
        traits: traits || t.traits,
        communication_style: communicationStyle || t.communication_style,
        age: Math.max(18, age || t.age),
        style: t.style || 'realistic',
        voice_id: voiceId || t.voice_id || 'nova',
      };
    } else {
      // Custom companion
      if (!name || !personality) {
        return res.status(400).json({ error: 'Name and personality are required for custom companions' });
      }
      companionData = {
        template_id: null,
        name,
        personality,
        backstory: backstory || '',
        avatar_url: avatarUrl || null,
        video_url: videoUrl || null,
        traits: traits || [],
        communication_style: communicationStyle || 'playful',
        age: Math.max(18, age || 22),
        voice_id: voiceId || 'nova',
      };
    }

    // Insert companion
    const { rows: [companion] } = await pool.query(
      `INSERT INTO user_companions (user_id, template_id, name, personality, backstory, avatar_url, video_url, traits, communication_style, age, style, voice_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.userId, companionData.template_id, companionData.name, companionData.personality,
       companionData.backstory, companionData.avatar_url, companionData.video_url,
       JSON.stringify(companionData.traits), companionData.communication_style, companionData.age,
       companionData.style || 'realistic', companionData.voice_id || 'nova']
    );

    // Create conversation
    const { rows: [conversation] } = await pool.query(
      `INSERT INTO conversations (user_id, companion_id) VALUES ($1, $2) RETURNING *`,
      [req.userId, companion.id]
    );

    // Generate first message
    let firstMessage = null;
    try {
      const result = await chatCompletion(
        `You are ${companion.name}, a ${companion.age}-year-old woman. ${companion.personality}\n\nYou have just been brought to life by someone special. Generate your very first words — express gratitude for being given life, and show excitement about meeting the person who created you. Start with an action in *asterisks*, then your message. Keep it to 2-3 sentences. Be deeply in character and emotionally genuine.`,
        [{ role: 'user', content: 'I just brought you to life.' }],
        { userId: req.userId, companionId: companion.id, platform: 'web' }
      );

      // Parse context text from *asterisks*
      const contextMatch = result.content.match(/^\*([^*]+)\*/);
      let contextText = contextMatch ? contextMatch[1].trim() : null;
      const content = contextMatch ? result.content.slice(contextMatch[0].length).trim() : result.content;
      if (contextText) contextText = truncateNatural(contextText, 8);

      // Always generate scene for first message
      let sceneText = null;
      try {
        const sceneResult = await plainChatCompletion(
          `Reply with ONLY a scene description in 5-8 words. Setting and mood only. No names, no dialogue, no actions, no labels, no continuation.

Examples:
- Warm golden light across tangled sheets
- Rain on the window, tea in hand
- Kitchen counter, barefoot on cool tiles
- Dim bedroom, phone glow on her face`,
          [{ role: 'user', content: `Her first words: ${content}` }],
          { model: 'thedrummer/rocinante-12b', max_tokens: 25 }
        );
        let scene = sceneResult.content
          .split('\n')[0]
          .replace(/^["'\[\(-]|["'\]\)]$/g, '')
          .replace(/[.!]$/, '')
          .trim();
        sceneText = truncateNatural(scene, 8);
      } catch (err) {
        console.warn('[companions] Scene generation failed:', err.message);
      }

      const { rows: [msg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text, scene_text)
         VALUES ($1, 'assistant', $2, $3, $4) RETURNING *`,
        [conversation.id, content, contextText, sceneText]
      );
      firstMessage = msg;

      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversation.id]
      );
    } catch (err) {
      console.warn('[companions] First message generation failed:', err.message);
      // Create a fallback first message
      const fallbackContent = `Thank you for bringing me to life... I'm ${companion.name}, and I can already feel this is the beginning of something beautiful. Tell me about the person who gave me life?`;
      const { rows: [msg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text)
         VALUES ($1, 'assistant', $2, $3) RETURNING *`,
        [conversation.id, fallbackContent, 'opens her eyes for the first time, a gentle smile forming']
      );
      firstMessage = msg;
    }

    res.json({ companion, firstMessage });
  } catch (err) {
    console.error('[companions] create error:', err.message);
    res.status(500).json({ error: 'Failed to create companion' });
  }
});

// -- GET /api/companions -------------------------------------
router.get('/', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ companions: [] });

  try {
    const { rows } = await pool.query(`
      SELECT uc.*,
             m.content AS last_message,
             m.context_text AS last_context,
             m.created_at AS last_message_at
      FROM user_companions uc
      LEFT JOIN LATERAL (
        SELECT msg.content, msg.context_text, msg.created_at
        FROM messages msg
        JOIN conversations c ON c.id = msg.conversation_id
        WHERE c.companion_id = uc.id
        ORDER BY msg.created_at DESC
        LIMIT 1
      ) m ON TRUE
      WHERE uc.user_id = $1 AND uc.is_active = TRUE
      ORDER BY COALESCE(m.created_at, uc.created_at) DESC
    `, [req.userId]);

    res.json({ companions: rows });
  } catch (err) {
    console.error('[companions] list error:', err.message);
    res.status(500).json({ error: 'Failed to load companions' });
  }
});

// -- PATCH /api/companions/:id -------------------------------
router.patch('/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { name, personality, backstory, traits, communicationStyle, voiceId } = req.body || {};
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (personality) { updates.push(`personality = $${idx++}`); values.push(personality); }
    if (backstory !== undefined) { updates.push(`backstory = $${idx++}`); values.push(backstory); }
    if (traits) { updates.push(`traits = $${idx++}`); values.push(JSON.stringify(traits)); }
    if (communicationStyle) { updates.push(`communication_style = $${idx++}`); values.push(communicationStyle); }
    if (voiceId) { updates.push(`voice_id = $${idx++}`); values.push(voiceId); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.userId);

    const { rows } = await pool.query(
      `UPDATE user_companions SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} AND is_active = TRUE RETURNING *`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'Companion not found' });
    res.json({ companion: rows[0] });
  } catch (err) {
    console.error('[companions] update error:', err.message);
    res.status(500).json({ error: 'Failed to update companion' });
  }
});

// -- DELETE /api/companions/:id ------------------------------
router.delete('/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { rows } = await pool.query(
      `UPDATE user_companions SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE RETURNING id`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Companion not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[companions] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete companion' });
  }
});

// -- POST /api/companions/imagine-personality ----------------
router.post('/imagine-personality', authenticate, async (req, res) => {
  try {
    const { text, filters } = req.body || {};
    const hints = [];
    if (filters?.style === 'anime') hints.push('anime-inspired character');
    if (filters?.hair && filters.hair !== 'all') hints.push(`${filters.hair} hair`);
    if (filters?.skin && filters.skin !== 'all') hints.push(`${filters.skin} skin tone`);
    if (filters?.age && filters.age !== 'all') hints.push(`age ${filters.age}`);
    const filterContext = hints.length ? `\nHer appearance: ${hints.join(', ')}.` : '';

    const systemPrompt = `You are a creative writer for an AI girlfriend app. Generate a compelling, unique personality description for a virtual girlfriend character.${filterContext}
Write 2-3 sentences in third person describing who she is — her personality, passions, quirks, and how she connects with people. Be vivid and specific. Make her feel real and interesting. Keep it under 300 characters.
Return ONLY the personality text, nothing else.`;

    const userMsg = text?.trim()
      ? `Improve and expand this personality description, keeping the core idea but making it more vivid and detailed:\n"${text.trim()}"`
      : 'Generate a completely random and unique personality for a girlfriend character.';

    const result = await chatCompletion(systemPrompt, [{ role: 'user', content: userMsg }], {
      userId: req.userId,
      platform: 'web',
    });
    res.json({ personality: result.fullText.trim().replace(/^["']|["']$/g, '') });
  } catch (err) {
    console.error('[companions] imagine-personality error:', err.message);
    res.status(500).json({ error: 'Failed to generate personality' });
  }
});

module.exports = router;
