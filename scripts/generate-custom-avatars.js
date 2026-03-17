#!/usr/bin/env node
/**
 * Generate 20 diverse avatar images for custom companion creation.
 * Stored in R2 at avatars/custom/001.jpg ... avatars/custom/020.jpg
 *
 * Usage: node scripts/generate-custom-avatars.js
 * Cost: ~$0.50 (20 × $0.025 via fal.ai flux-dev)
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { uploadFromUrl } = require('../server/src/r2');

const FAL_KEY = (process.env.FAL_KEY || '').trim();
const FAL_BASE = 'https://fal.run';

const STYLES = [
  'A beautiful young woman with long dark wavy hair, warm brown eyes, soft smile, casual white top, natural lighting portrait',
  'A stunning young woman with short blonde pixie cut, blue eyes, confident expression, black leather jacket, urban background portrait',
  'A gorgeous young woman with red curly hair, green eyes, playful smirk, sundress, golden hour outdoor portrait',
  'A beautiful young Asian woman with straight black hair, dark eyes, gentle smile, pastel sweater, cozy indoor portrait',
  'A striking young woman with platinum blonde hair, hazel eyes, mysterious look, dark turtleneck, moody lighting portrait',
  'A lovely young woman with brown braids, warm smile, freckles, denim jacket, natural daylight portrait',
  'A beautiful young Latina woman with long dark straight hair, brown eyes, bright smile, floral blouse, warm tones portrait',
  'A gorgeous young woman with auburn hair in a messy bun, blue-grey eyes, relaxed expression, oversized hoodie, soft lighting portrait',
  'A stunning young woman with jet black bob cut, dark eyes, elegant look, red lips, silk blouse, studio lighting portrait',
  'A beautiful young woman with honey blonde beach waves, tan skin, bright smile, bikini top, tropical background portrait',
  'A lovely young woman with dark brown curls, brown eyes, shy smile, turtleneck sweater, autumn vibes portrait',
  'A striking young woman with silver-lavender hair, blue eyes, edgy look, graphic tee, neon lighting portrait',
  'A gorgeous young woman with long chestnut hair, green eyes, warm expression, cream knit top, window light portrait',
  'A beautiful young Black woman with natural afro, dark eyes, radiant smile, gold earrings, warm lighting portrait',
  'A stunning young woman with strawberry blonde hair, light eyes, dreamy expression, off-shoulder top, sunset portrait',
  'A lovely young woman with dark hair and highlights, brown eyes, bold look, blazer, professional studio portrait',
  'A beautiful young woman with wavy caramel hair, hazel eyes, sweet smile, crop top, beach vibes portrait',
  'A gorgeous young woman with long black hair, almond eyes, serene expression, traditional-inspired top, soft portrait',
  'A striking young woman with short brown hair, sharp features, fierce look, tank top, gym setting portrait',
  'A beautiful young woman with copper red straight hair, pale skin, bright green eyes, vintage dress, garden portrait',
];

async function generateOne(prompt, index) {
  const num = String(index + 1).padStart(3, '0');

  const fullPrompt = `${prompt}. Portrait photo, upper body, looking at camera, 20-25 years old adult woman, high quality, photorealistic. MANDATORY: The subject must be a clearly adult woman, 20+ years old.`;

  const response = await fetch(`${FAL_BASE}/fal-ai/flux/schnell`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      image_size: { width: 768, height: 1024 },
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai ${response.status}: ${err}`);
  }

  const result = await response.json();
  const falUrl = result.images?.[0]?.url || result.image?.url;
  if (!falUrl) throw new Error('No image URL in response');

  const { url } = await uploadFromUrl(falUrl, 'avatars/custom', { extension: '.jpg' });
  return url;
}

async function main() {
  if (!FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1); }

  console.log(`Generating ${STYLES.length} custom avatars...\n`);

  const urls = [];
  for (let i = 0; i < STYLES.length; i++) {
    const num = String(i + 1).padStart(3, '0');
    console.log(`[${num}] Generating...`);
    try {
      const url = await generateOne(STYLES[i], i);
      urls.push(url);
      console.log(`[${num}] ${url}`);
    } catch (err) {
      console.error(`[${num}] FAILED: ${err.message}`);
    }
  }

  console.log(`\n--- Generated ${urls.length} avatars ---`);
  console.log('const CUSTOM_AVATARS = [');
  urls.forEach(u => console.log(`  '${u}',`));
  console.log('];');
}

main();
