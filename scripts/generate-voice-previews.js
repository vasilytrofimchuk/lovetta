#!/usr/bin/env node
/**
 * One-time script: generate short voice preview clips for all 18 voices.
 * Uploads to R2 at audio/voice-preview-{voiceId}.mp3
 *
 * Usage: node scripts/generate-voice-previews.js
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { generateSpeech } = require('../server/src/ai');
const { uploadBuffer } = require('../server/src/r2');

const VOICES = [
  { id: 'b089032e45db460fb1934ece75a8c51d', label: 'Ember', phrase: "Come closer. I want to whisper something to you." },
  { id: '7e9a17104fd644bb86b91a240b4f2055', label: 'Aurora', phrase: "There's something magical about tonight, don't you think?" },
  { id: '58c1e4127a924d678a1a9d49e3751669', label: 'Flame', phrase: "Hey you! I've been thinking about you all day." },
  { id: '8126dcf7ccd949a2b4d83c328efb91a5', label: 'Velour', phrase: "Don't worry, I'm right here with you." },
  { id: '3c274731ecfb45e99f2dd5f65b32b518', label: 'Spark', phrase: "Oh my gosh, you won't believe what just happened!" },
  { id: '83c19893c4974594839bd2d101b1fd66', label: 'Crystal', phrase: "Tell me everything. I want to hear it all." },
  { id: 'db841cac47164082b26fcfe54c27748d', label: 'Silk', phrase: "Mmm, that sounds absolutely wonderful, darling." },
  { id: 'b1e436a2375f4cdfbefc432381e385f4', label: 'Pearl', phrase: "Good morning, gorgeous. Ready for an amazing day?" },
  { id: '42f70c38fa054b65a6baecd4f817d696', label: 'Fizz', phrase: "Let's go on an adventure together, just us two!" },
  { id: '13ea42e651954876a59109ba40c8cdb2', label: 'Breeze', phrase: "I could stay up all night talking with you." },
  { id: '42e70f5bc7b34a9e84abbbd6ec5572d0', label: 'Dazzle', phrase: "Look at me. You have my full attention." },
  { id: '8ef4a238714b45718ce04243307c57a7', label: 'Honey', phrase: "You're so sweet, I can't stop smiling right now!" },
  { id: '37ab9e84be5b42a18681adb35ab988d1', label: 'Moon', phrase: "Close your eyes. Let me take all your stress away." },
  { id: 'd60c136243984ec78a3be125b2f38faf', label: 'Mist', phrase: "I felt something the moment you walked in." },
  { id: 'df5c6c19dca944918dcbd6f1368fd02f', label: 'Fairy', phrase: "Make a wish! I promise I'll make it come true." },
  { id: '584afa907518428fac9b04c92ec8a563', label: 'Willow', phrase: "Let me tell you a secret nobody else knows." },
  { id: '08b50a4cac844cea91a4b396bd1d10c3', label: 'Blossom', phrase: "Yay, you're here! I missed you so much!" },
  { id: '22550e2d849b44e18c7df57f61e666f9', label: 'Echo', phrase: "So, how was your day? Tell me the real version." },
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
