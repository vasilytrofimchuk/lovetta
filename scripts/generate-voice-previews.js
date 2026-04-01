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
  { id: '933563129e564b19a115bedd57b7406a', label: 'Aurora', phrase: "There's something magical about tonight, don't you think?" },
  { id: 'c2623f0c075b4492ac367989aee1576f', label: 'Flame', phrase: "Hey you! I've been thinking about you all day." },
  { id: '8126dcf7ccd949a2b4d83c328efb91a5', label: 'Velour', phrase: "Don't worry, I'm right here with you." },
  { id: 'b545c585f631496c914815291da4e893', label: 'Spark', phrase: "Oh my gosh, you won't believe what just happened!" },
  { id: 'e3cd384158934cc9a01029cd7d278634', label: 'Crystal', phrase: "Tell me everything. I want to hear it all." },
  { id: 'b347db033a6549378b48d00acb0d06cd', label: 'Silk', phrase: "Mmm, that sounds absolutely wonderful, darling." },
  { id: 'b1e436a2375f4cdfbefc432381e385f4', label: 'Pearl', phrase: "Good morning, gorgeous. Ready for an amazing day?" },
  { id: '59e9dc1cb20c452584788a2690c80970', label: 'Fizz', phrase: "Let's go on an adventure together, just us two!" },
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
