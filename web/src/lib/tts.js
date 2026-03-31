import api from './api';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForMessageAudio(messageId, {
  timeoutMs = 20000,
  pollDelayMs = 2000,
} = {}) {
  if (!messageId) throw new Error('messageId required');

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { data } = await api.post('/api/chat/tts', { messageId });
      if (data?.audioUrl) return data;
    } catch (err) {
      // Server error — retry unless timeout
      if (Date.now() - startedAt + pollDelayMs >= timeoutMs) {
        throw err;
      }
    }

    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await sleep(Math.min(pollDelayMs, remaining));
  }

  return { audioUrl: null, error: 'Audio generation timed out' };
}
