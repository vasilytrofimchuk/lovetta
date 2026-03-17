#!/usr/bin/env node
/**
 * One-time script: generate short voice preview clips for all 18 voices.
 * Uploads to R2 at audio/voice-preview-{voiceId}.mp3
 *
 * Usage: node scripts/generate-voice-previews.js
 * Cost: ~$0.13 total
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { generateSpeech } = require('../server/src/ai');
const { uploadBuffer } = require('../server/src/r2');

const VOICES = [
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Sunshine', phrase: "Hey you! I've been thinking about you all day." },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Velvet', phrase: "Don't worry, I'm right here with you." },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Spark', phrase: "Oh my gosh, you won't believe what just happened!" },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Crystal', phrase: "Tell me everything. I want to hear it all." },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Silk', phrase: "Mmm, that sounds absolutely wonderful, darling." },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Pearl', phrase: "Good morning, gorgeous. Ready for an amazing day?" },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Storm', phrase: "Look at me. You have my full attention." },
  { id: 'KF337ZXYjoHdNuYUrufC', label: 'Ember', phrase: "Come closer. I want to whisper something to you." },
  { id: 'AyCt0WmAXUcPJR11zeeP', label: 'Breeze', phrase: "Let's go on an adventure together, just us two!" },
  { id: 'lhgliD0TncfFOY1Nc93M', label: 'Dusk', phrase: "I could stay up all night talking with you." },
  { id: 'rBUHN6YO9PJUwGXk13Jt', label: 'Aurora', phrase: "There's something magical about tonight, don't you think?" },
  { id: 'jpICOesdLlRSc39O1UB5', label: 'Honey', phrase: "You're so sweet, I can't stop smiling right now!" },
  { id: '6tHWtWy43FFxMeA73K4c', label: 'Moon', phrase: "Close your eyes. Let me take all your stress away." },
  { id: 's50zV0dPjgaPRdN9zm48', label: 'Coral', phrase: "So, how was your day? Tell me the real version." },
  { id: 'z12gfZvqqjJ9oHFbB5i6', label: 'Fairy', phrase: "Make a wish! I promise I'll make it come true." },
  { id: 'ytfkKJNB1AXxIr8dKm5H', label: 'Willow', phrase: "Let me tell you a secret nobody else knows." },
  { id: 'OHY6EjdeHKeQymoihwfz', label: 'Blossom', phrase: "Yay, you're here! I missed you so much!" },
  { id: 'nPpkc230TdYdntJKFNby', label: 'Echo', phrase: "I felt something the moment you walked in." },
];

async function main() {
  console.log(`Generating ${VOICES.length} voice previews...\n`);
  let totalCost = 0;

  for (const v of VOICES) {
    const filename = `voice-preview-${v.id}`;
    console.log(`[${v.label}] Generating: "${v.phrase}"`);

    try {
      const { buffer, costUsd } = await generateSpeech(v.phrase, v.id);
      totalCost += costUsd || 0;

      const { url } = await uploadBuffer(buffer, 'audio', {
        filename,
        extension: '.mp3',
        contentType: 'audio/mpeg',
      });

      console.log(`  ✓ ${url} ($${(costUsd || 0).toFixed(4)})\n`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
    }
  }

  console.log(`\nDone! Total cost: $${totalCost.toFixed(4)}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
