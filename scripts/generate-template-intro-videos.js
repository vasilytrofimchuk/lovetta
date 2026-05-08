#!/usr/bin/env node
/**
 * Generate flirty intro images + videos for all 18 companion templates.
 *
 * For each template:
 *   1. Generate a new flirty image (using avatar_url as identity reference)
 *   2. Generate a 5-second video from that image
 *   3. Update companion_templates.video_url with the new video
 *
 * The video is sent as intro media when a user creates a new companion.
 * Same template → same video (reused automatically).
 *
 * Cost: ~$0.275 per template ($0.025 image + $0.25 video) ≈ $5 for 18 templates
 *
 * Usage:
 *   node scripts/generate-template-intro-videos.js              # all templates
 *   node scripts/generate-template-intro-videos.js --only 1,5   # specific IDs
 *   node scripts/generate-template-intro-videos.js --force       # regenerate even if video exists
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { getPool } = require('../server/src/db');
const { generateCharacterImage, generateVideo } = require('../server/src/ai');

// Flirty image prompts — varied so each girl gets a unique vibe
const FLIRTY_PROMPTS = [
  'flirty selfie on bed, wearing a silk camisole, soft warm bedroom lighting, playful smile, looking at camera',
  'leaning against doorframe in lingerie, soft golden hour light, seductive half-smile, eye contact',
  'lying on satin sheets, wearing lace top, dim ambient lighting, dreamy expression, looking up at camera',
  'sitting on bed in oversized shirt slipping off shoulder, morning light, coy smile, messy hair',
  'mirror selfie in matching underwear set, warm bathroom lighting, confident pose, playful wink',
  'lounging on couch in silk robe slightly open, candle-lit room, inviting expression, relaxed pose',
  'standing by window in sheer nightgown, moonlight silhouette, looking over shoulder, mysterious smile',
  'kneeling on bed in lace bodysuit, soft pink neon glow, biting lip, flirty eyes',
  'lying on stomach on bed, wearing crop top, chin on hands, playful kick, warm fairy lights behind',
  'towel wrap after shower, wet hair, steamy bathroom, teasing smile, natural beauty',
  'silk slip dress, sitting on edge of bed, legs crossed, dim lamp light, inviting gaze',
  'stretching in bed, wearing tank top and shorts, morning sunlight, sleepy but flirty smile',
  'posing in front of vanity mirror, lace bralette, soft focus, applying lip gloss, eye contact in mirror',
  'leaning on balcony rail at dusk, backless dress, city lights bokeh, looking back at camera',
  'sitting in bathtub with bubbles, hair up, candlelight, playful splash, mischievous grin',
  'lying on fluffy rug, oversized sweater and thigh-highs, warm fireplace glow, chin resting on arm',
  'dancing in bedroom, silk pajama shorts, hair flowing, caught mid-laugh, warm string lights',
  'reclining on velvet chaise, elegant lingerie, moody dramatic lighting, smoldering gaze',
];

const VIDEO_MOTION_PROMPT = 'Subtle natural movement, gentle breathing, soft hair sway, slight head tilt with a flirty smile, warm cinematic lighting, intimate close portrait video';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--only');
  const onlyIds = onlyIdx >= 0 ? args[onlyIdx + 1].split(',').map(Number) : null;

  const pool = getPool();
  if (!pool) { console.error('No DATABASE_URL'); process.exit(1); }

  const { rows: templates } = await pool.query(
    'SELECT id, name, avatar_url, video_url, style FROM companion_templates WHERE is_active = TRUE ORDER BY sort_order'
  );

  console.log(`Found ${templates.length} templates`);
  if (onlyIds) console.log(`Filtering to IDs: ${onlyIds.join(', ')}`);
  if (force) console.log('Force mode: regenerating all');
  console.log(`Estimated cost: ~$${((onlyIds ? onlyIds.length : templates.length) * 0.275).toFixed(2)}\n`);

  let totalCost = 0;
  let generated = 0;
  let skipped = 0;

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];

    if (onlyIds && !onlyIds.includes(t.id)) continue;

    if (t.video_url && !force) {
      console.log(`[${t.name}] Already has video, skipping (use --force to regenerate)`);
      skipped++;
      continue;
    }

    if (!t.avatar_url) {
      console.log(`[${t.name}] No avatar_url, skipping`);
      skipped++;
      continue;
    }

    const prompt = FLIRTY_PROMPTS[i % FLIRTY_PROMPTS.length];
    console.log(`[${t.name}] Step 1/2: Generating flirty image...`);
    console.log(`  Prompt: ${prompt.slice(0, 80)}...`);

    try {
      // Step 1: Generate flirty image from avatar reference
      const imageResult = await generateCharacterImage(t.avatar_url, prompt, {
        companionId: `templates/${t.id}/intro`,
      });
      console.log(`[${t.name}] Image ready: ${imageResult.url} ($${imageResult.cost})`);
      totalCost += imageResult.cost;

      // Step 2: Generate video from that flirty image
      console.log(`[${t.name}] Step 2/2: Generating video...`);
      const videoResult = await generateVideo(imageResult.url, VIDEO_MOTION_PROMPT, {
        companionId: `templates/${t.id}/intro`,
      });
      console.log(`[${t.name}] Video ready: ${videoResult.url} ($${videoResult.cost})`);
      totalCost += videoResult.cost;

      // Step 3: Update template in DB
      await pool.query(
        'UPDATE companion_templates SET video_url = $1 WHERE id = $2',
        [videoResult.url, t.id]
      );
      console.log(`[${t.name}] DB updated\n`);
      generated++;

    } catch (err) {
      console.error(`[${t.name}] FAILED: ${err.message}\n`);
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Total cost: $${totalCost.toFixed(3)}`);
  process.exit(0);
}

main();
