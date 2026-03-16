/**
 * TTS API — on-demand text-to-speech for companion messages.
 * Generates audio via OpenAI TTS, caches in R2.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { generateSpeech } = require('./ai');
const { uploadBuffer } = require('./r2');
const { trackConsumption } = require('./consumption');

const router = Router();

// POST /api/chat/tts
router.post('/tts', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { messageId } = req.body || {};
    if (!messageId) return res.status(400).json({ error: 'messageId required' });

    // Verify message ownership via conversation → user
    const { rows: [msg] } = await pool.query(
      `SELECT m.id, m.content, m.role, c.user_id, c.companion_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1`,
      [messageId]
    );

    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (msg.role !== 'assistant') return res.status(400).json({ error: 'Only assistant messages can be played' });

    // Check R2 cache — if already generated, return URL
    const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    const cacheKey = `audio/${messageId}.mp3`;
    const cachedUrl = `${R2_PUBLIC_URL}/${cacheKey}`;

    // Try fetching cached audio (HEAD request)
    try {
      const headRes = await fetch(cachedUrl, { method: 'HEAD' });
      if (headRes.ok) {
        return res.json({ audioUrl: cachedUrl });
      }
    } catch {}

    // Get companion voice
    const { rows: [companion] } = await pool.query(
      'SELECT voice_id FROM user_companions WHERE id = $1',
      [msg.companion_id]
    );
    const voiceId = companion?.voice_id || 'nova';

    // Generate speech
    const { buffer, costUsd } = await generateSpeech(msg.content, voiceId);

    // Upload to R2
    const { url: audioUrl } = await uploadBuffer(buffer, 'audio', {
      filename: messageId,
      extension: '.mp3',
      contentType: 'audio/mpeg',
    });

    // Track consumption
    await trackConsumption({
      userId: req.userId,
      companionId: msg.companion_id,
      provider: 'openai',
      model: 'tts-1',
      callType: 'tts',
      costUsd,
      metadata: { messageId, chars: msg.content.length, voice: voiceId },
    });

    res.json({ audioUrl: audioUrl || cachedUrl });
  } catch (err) {
    console.error('[tts] error:', err.message);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

module.exports = router;
