#!/usr/bin/env node
/**
 * One-time script: generate 5-second preview videos for all companion templates.
 * Uses fal.ai image-to-video via the existing generateVideo() function.
 *
 * Usage: node scripts/generate-template-videos.js
 * Cost: ~$0.25 per template (~$3 for all 12)
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { getPool } = require('../server/src/db');
const { generateVideo } = require('../server/src/ai');

const MOTION_PROMPT = 'A beautiful young woman looking at camera with a gentle smile, subtle natural movement, slight hair sway, soft breathing, warm cinematic lighting, portrait video';

async function main() {
  const pool = getPool();
  if (!pool) { console.error('No DATABASE_URL'); process.exit(1); }

  const { rows: templates } = await pool.query(
    'SELECT id, name, avatar_url, video_url FROM companion_templates WHERE is_active = TRUE ORDER BY sort_order'
  );

  console.log(`Found ${templates.length} templates\n`);

  for (const t of templates) {
    if (t.video_url) {
      console.log(`[${t.name}] Already has video, skipping: ${t.video_url}`);
      continue;
    }
    if (!t.avatar_url) {
      console.log(`[${t.name}] No avatar_url, skipping`);
      continue;
    }

    console.log(`[${t.name}] Generating video from ${t.avatar_url}...`);
    try {
      const result = await generateVideo(t.avatar_url, MOTION_PROMPT, {
        companionId: `templates/${t.id}`,
      });
      console.log(`[${t.name}] Video: ${result.url} (cost: $${result.cost})`);

      await pool.query('UPDATE companion_templates SET video_url = $1 WHERE id = $2', [result.url, t.id]);
      console.log(`[${t.name}] DB updated\n`);
    } catch (err) {
      console.error(`[${t.name}] FAILED: ${err.message}\n`);
    }
  }

  console.log('Done!');
  process.exit(0);
}

main();
