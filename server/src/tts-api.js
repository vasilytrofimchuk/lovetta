/**
 * TTS + STT API — ElevenLabs text-to-speech and speech-to-text.
 * TTS: on-demand generation with R2 caching, audio tags for emotions.
 * STT: voice input transcription via Scribe v2.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { generateSpeech, transcribeSpeech } = require('./ai');
const { uploadBuffer } = require('./r2');
const { trackConsumption } = require('./consumption');

const router = Router();

// In-flight TTS requests: messageId → Promise<audioUrl>
// Prevents duplicate concurrent ElevenLabs calls for the same message
const ttsInFlight = new Map();

// Convert *actions* to ElevenLabs [audio tags]
// Vocal actions become real sounds, visual actions get stripped
function actionsToAudioTags(content) {
  return content.replace(/\*([^*]+)\*/g, (_, action) => {
    const lower = action.toLowerCase().trim();

    // Vocal sounds → ElevenLabs audio tags
    if (/\bgiggles?\b|giggling/.test(lower)) return '[giggles] ';
    if (/\blaughs?\b|laughing/.test(lower)) return '[laughs] ';
    if (/\bchuckles?\b/.test(lower)) return '[laughs] ';
    if (/\bsighs?\b|sighing/.test(lower)) return '[sighs] ';
    if (/\bgasps?\b/.test(lower)) return '[gasps] ';
    if (/\bwhispers?\b|whispering/.test(lower)) return '[whispers] ';
    if (/\bmoans?\b|moaning/.test(lower)) return '[sighs] ';
    if (/\bpurrs?\b|purring/.test(lower)) return '[sighs] ';
    if (/\bcrying\b|cries\b|sobs?\b/.test(lower)) return '[crying] ';
    if (/\bsnorts?\b/.test(lower)) return '[snorts] ';
    if (/\bsings?\b|singing/.test(lower)) return '[sings] ';
    if (/\bexcited/.test(lower)) return '[excited] ';
    if (/\bsarcasti/.test(lower)) return '[sarcastic] ';
    if (/\bcurious/.test(lower)) return '[curious] ';
    if (/\bhappil/.test(lower)) return '[happily] ';
    if (/\bsad\b|sorrowful/.test(lower)) return '[sad] ';
    if (/\bangr/.test(lower)) return '[angry] ';
    if (/\bmischiev/.test(lower)) return '[mischievously] ';
    if (/\bclears?\s+throat/.test(lower)) return '[clears throat] ';
    if (/\bgulps?\b|swallows?\b/.test(lower)) return '[gulps] ';
    if (/\bhesitat/.test(lower)) return '[hesitates] ';
    if (/\bstammer/.test(lower)) return '[stammers] ';

    // Visual/physical actions — strip (can't voice "leans closer", "winks", etc.)
    return '';
  }).replace(/\s+/g, ' ').trim();
}

// POST /api/chat/tts — generate audio for a message
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

    // Check R2 cache
    const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    const cachedUrl = `${R2_PUBLIC_URL}/audio/${messageId}.mp3`;

    try {
      const headRes = await fetch(cachedUrl, { method: 'HEAD' });
      if (headRes.ok) return res.json({ audioUrl: cachedUrl });
    } catch {}

    // Dedup: if same messageId is already being generated, wait for it
    if (ttsInFlight.has(messageId)) {
      try {
        const audioUrl = await ttsInFlight.get(messageId);
        return res.json({ audioUrl });
      } catch (err) {
        return res.status(500).json({ error: 'TTS generation failed' });
      }
    }

    // Start generation and register the promise for dedup
    const generatePromise = (async () => {
      // Get companion voice
      const { rows: [companion] } = await pool.query(
        'SELECT voice_id FROM user_companions WHERE id = $1',
        [msg.companion_id]
      );
      let voiceId = companion?.voice_id || 'cgSgspJ2msm6clMCkdW9';
      if (voiceId.length < 20) voiceId = 'cgSgspJ2msm6clMCkdW9';

      const ttsText = actionsToAudioTags(msg.content);
      if (!ttsText) throw new Error('No speakable text');

      const { buffer, costUsd } = await generateSpeech(ttsText, voiceId);

      const { url: audioUrl } = await uploadBuffer(buffer, 'audio', {
        filename: messageId,
        extension: '.mp3',
        contentType: 'audio/mpeg',
      });

      await trackConsumption({
        userId: req.userId,
        companionId: msg.companion_id,
        provider: 'elevenlabs',
        model: 'eleven_v3',
        callType: 'tts',
        costUsd,
        metadata: { messageId, chars: ttsText.length, voice: voiceId },
      });

      return audioUrl || cachedUrl;
    })();

    ttsInFlight.set(messageId, generatePromise);
    try {
      const audioUrl = await generatePromise;
      res.json({ audioUrl });
    } finally {
      ttsInFlight.delete(messageId);
    }
  } catch (err) {
    console.error('[tts] error:', err.message);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// POST /api/chat/stt — transcribe voice audio to text
router.post('/stt', authenticate, async (req, res) => {
  try {
    // Expect raw audio body with content-type header
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer.length) return res.status(400).json({ error: 'No audio data' });

    const contentType = req.headers['content-type'] || 'audio/webm';
    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mp4') ? 'mp4' : 'webm';

    const { text } = await transcribeSpeech(audioBuffer, `voice.${ext}`);
    res.json({ text });
  } catch (err) {
    console.error('[stt] error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;
