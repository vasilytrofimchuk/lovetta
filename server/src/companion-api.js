/**
 * Companion API — templates, creation, management.
 * Users create up to max_companions AI companions from templates or custom.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { chatCompletion } = require('./ai');

const router = Router();

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

    const { templateId, name, personality, backstory, traits, communicationStyle, age } = req.body || {};
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
        traits: traits || t.traits,
        communication_style: communicationStyle || t.communication_style,
        age: Math.max(20, age || t.age),
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
        avatar_url: null,
        traits: traits || [],
        communication_style: communicationStyle || 'playful',
        age: Math.max(20, age || 22),
      };
    }

    // Insert companion
    const { rows: [companion] } = await pool.query(
      `INSERT INTO user_companions (user_id, template_id, name, personality, backstory, avatar_url, traits, communication_style, age)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.userId, companionData.template_id, companionData.name, companionData.personality,
       companionData.backstory, companionData.avatar_url, JSON.stringify(companionData.traits),
       companionData.communication_style, companionData.age]
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
      const contextText = contextMatch ? contextMatch[1].trim() : null;
      const content = contextMatch ? result.content.slice(contextMatch[0].length).trim() : result.content;

      const { rows: [msg] } = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, context_text)
         VALUES ($1, 'assistant', $2, $3) RETURNING *`,
        [conversation.id, content, contextText]
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
    const { name, personality, backstory, traits, communicationStyle } = req.body || {};
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (personality) { updates.push(`personality = $${idx++}`); values.push(personality); }
    if (backstory !== undefined) { updates.push(`backstory = $${idx++}`); values.push(backstory); }
    if (traits) { updates.push(`traits = $${idx++}`); values.push(JSON.stringify(traits)); }
    if (communicationStyle) { updates.push(`communication_style = $${idx++}`); values.push(communicationStyle); }

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

module.exports = router;
