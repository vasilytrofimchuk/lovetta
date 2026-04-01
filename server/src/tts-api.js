/**
 * TTS + STT API — Fish.audio text-to-speech + OpenAI speech-to-text.
 * TTS: on-demand generation with R2 caching, emotion tags for Fish.audio S2.
 * STT: voice input transcription via OpenAI gpt-4o-mini-transcribe.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const { generateSpeech, transcribeSpeech } = require('./ai');
const { uploadBuffer } = require('./r2');
const consumption = require('./consumption');

const router = Router();

function getAudioExtension(contentType = '') {
  const lower = String(contentType).toLowerCase();
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('aac')) return 'aac';
  if (lower.includes('m4a')) return 'm4a';
  if (lower.includes('mp4')) return 'mp4';
  if (lower.includes('mp3') || lower.includes('mpeg')) return 'mp3';
  return 'webm';
}

// In-flight TTS requests: messageId → Promise<audioUrl>
// Prevents duplicate concurrent fish.audio calls for the same message
const ttsInFlight = new Map();

// Convert *actions* to fish.audio S2 emotion/sound tags
// Supported tags become [bracket tags], unsupported are stripped
function actionsToAudioTags(content) {
  return content.replace(/\*([^*]+)\*/g, (_, action) => {
    const lower = action.toLowerCase().trim();

    // Vocal sounds → fish.audio S2 tags
    if (/\bgiggles?\b|giggling/.test(lower)) return '[laughing] ';
    if (/\blaughs?\b|laughing/.test(lower)) return '[laughing] ';
    if (/\bchuckles?\b/.test(lower)) return '[laughing] ';
    if (/\bsighs?\b|sighing/.test(lower)) return '[sighing] ';
    if (/\bgasps?\b/.test(lower)) return '[surprised] ';
    if (/\bwhispers?\b|whispering/.test(lower)) return '[whispering] ';
    if (/\bmoans?\b|moaning/.test(lower)) return '[sighing] ';
    if (/\bpurrs?\b|purring/.test(lower)) return '[sighing] ';
    if (/\bcrying\b|cries\b|sobs?\b/.test(lower)) return '[sobbing] ';
    if (/\bexcited/.test(lower)) return '[excited] ';
    if (/\bhappil/.test(lower)) return '[happy] ';
    if (/\bsad\b|sorrowful/.test(lower)) return '[sad] ';
    if (/\bangr/.test(lower)) return '[angry] ';

    // Multi-word = stage direction → strip
    if (action.trim().includes(' ')) return '';
    // Single word, not a known action = emphasis (e.g. *felt*) → keep as plain text
    return action;
  }).replace(/\s+/g, ' ').trim();
}

// POST /api/chat/tts — generate audio for a message
router.post('/tts', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'No database' });

  try {
    const { messageId, source } = req.body || {};
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

    // Block auto-generated TTS when user has auto_audio disabled
    if (source === 'auto') {
      const { rows: [pref] } = await pool.query(
        'SELECT auto_audio FROM user_preferences WHERE user_id = $1',
        [req.userId]
      );
      if (!pref?.auto_audio) {
        return res.status(403).json({ error: 'Auto audio is disabled' });
      }
    }

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
      let voiceId = companion?.voice_id || 'b089032e45db460fb1934ece75a8c51d';
      if (voiceId.length < 20) voiceId = 'b089032e45db460fb1934ece75a8c51d';

      const ttsText = actionsToAudioTags(msg.content);
      if (!ttsText) throw new Error('No speakable text');

      const { buffer, costUsd, credits } = await generateSpeech(ttsText, voiceId);

      const { url: audioUrl } = await uploadBuffer(buffer, 'audio', {
        filename: messageId,
        extension: '.mp3',
        contentType: 'audio/mpeg',
      });

      await consumption.trackConsumption({
        userId: req.userId,
        companionId: msg.companion_id,
        provider: 'fish_audio',
        model: 'fish_s2_pro',
        callType: 'tts',
        costUsd,
        metadata: { messageId, bytes: Buffer.byteLength(ttsText, 'utf8'), credits, voice: voiceId },
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
    const ext = getAudioExtension(contentType);

    const { text, durationSec, costUsd } = await transcribeSpeech(audioBuffer, `voice.${ext}`);
    res.json({ text });

    // Track STT credits (fire-and-forget)
    consumption.trackConsumption({
      userId: req.userId,
      provider: 'openai',
      model: 'gpt-4o-mini-transcribe',
      callType: 'stt',
      costUsd,
      metadata: { chars: text.length, audioBytes: audioBuffer.length, durationSec },
    }).catch(err => console.warn('[stt] consumption tracking failed:', err.message));
  } catch (err) {
    console.error('[stt] error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;
