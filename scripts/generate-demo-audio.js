#!/usr/bin/env node
/**
 * Pre-generate demo TTS audio for companion templates.
 * Each template gets a short flirty greeting in her voice.
 * Run: node scripts/generate-demo-audio.js
 *
 * Uploads to R2 at deterministic name-based paths, stores URLs in DB.
 */

const path = require('path');
const fs = require('fs');

// Load .env from project root
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const { generateSpeech } = require('../server/src/ai');
const r2 = require('../server/src/r2');

async function generateAndUpload(text, voiceId, filename) {
  const { buffer } = await generateSpeech(text, voiceId);
  const { url } = await r2.uploadBuffer(buffer, 'audio/demo', {
    filename,
    extension: '.mp3',
    contentType: 'audio/mpeg',
  });
  if (!url) throw new Error('R2 upload returned no URL');
  return url;
}

async function main() {
  const { getPool } = require('../server/src/db');
  const pool = getPool();
  if (!pool) { console.error('No database'); process.exit(1); }

  const { rows: templates } = await pool.query(
    'SELECT id, name, voice_id, tagline, personality FROM companion_templates WHERE is_active = TRUE ORDER BY sort_order, id'
  );

  console.log(`Found ${templates.length} active templates\n`);

  for (const template of templates) {
    const voiceId = template.voice_id || 'hA4zGnmTwX2NQiTRMt7o';
    const slug = template.name.toLowerCase().replace(/\s+/g, '-');

    // Short flirty demo message — unique per girl using her tagline
    const demoText = `Hey there... I'm ${template.name}. ${template.tagline || "I've been waiting for you."}`;

    console.log(`[${template.name}] voice=${voiceId}`);
    console.log(`  Generating "${demoText}" (${demoText.length} chars)`);

    try {
      const url = await generateAndUpload(demoText, voiceId, `demo-${slug}`);
      await pool.query('UPDATE companion_templates SET demo_audio_url = $2 WHERE id = $1', [template.id, url]);
      console.log(`  OK → ${url}\n`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}\n`);
    }
  }

  console.log('Done!');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
