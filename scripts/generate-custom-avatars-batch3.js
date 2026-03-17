#!/usr/bin/env node
/**
 * Generate 9 more avatar images (batch 3).
 */
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
const { uploadFromUrl } = require('../server/src/r2');
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const STYLES = [
  // Light skin
  'A beautiful young woman with light porcelain skin, long wavy brown hair, blue eyes, soft smile, cozy sweater, warm indoor portrait',
  'A gorgeous young woman with fair skin and freckles, honey blonde hair, green eyes, laughing, casual dress, sunlit portrait',
  'A stunning young woman with pale skin, dark red straight hair, grey eyes, gentle expression, black top, studio portrait',
  // Medium skin
  'A beautiful young Mediterranean woman with olive skin, dark wavy hair, brown eyes, warm smile, white blouse, golden hour portrait',
  'A gorgeous young mixed-race woman with tan skin, curly brown hair, hazel eyes, confident look, denim jacket, street portrait',
  'A lovely young woman with warm tan skin, black wavy hair, dark eyes, bright smile, colorful top, beach portrait',
  // Dark skin
  'A stunning young dark-skinned woman with long braids, dark brown eyes, radiant smile, off-shoulder top, golden light portrait',
  'A beautiful young woman with deep brown skin, short natural curls, dark eyes, joyful expression, hoop earrings, warm portrait',
  'A gorgeous young woman with rich dark skin, long straight black hair, brown eyes, elegant look, silk blouse, studio portrait',
];

async function main() {
  if (!FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1); }
  console.log(`Generating ${STYLES.length} avatars (batch 3)...\n`);
  const urls = [];
  for (let i = 0; i < STYLES.length; i++) {
    console.log(`[${i+1}] Generating...`);
    try {
      const fullPrompt = `${STYLES[i]}. Portrait photo, upper body, looking at camera, 20-25 years old adult woman, high quality, photorealistic. MANDATORY: The subject must be a clearly adult woman, 20+ years old.`;
      const response = await fetch(`https://fal.run/fal-ai/flux/schnell`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, image_size: { width: 768, height: 1024 }, num_images: 1 }),
      });
      if (!response.ok) throw new Error(`fal.ai ${response.status}: ${await response.text()}`);
      const result = await response.json();
      const falUrl = result.images?.[0]?.url;
      if (!falUrl) throw new Error('No image URL');
      const { url } = await uploadFromUrl(falUrl, 'avatars/custom', { extension: '.jpg' });
      urls.push(url);
      console.log(`[${i+1}] ${url}`);
    } catch (err) { console.error(`[${i+1}] FAILED: ${err.message}`); }
  }
  console.log(`\n--- Generated ${urls.length} avatars ---`);
  urls.forEach(u => console.log(`  '${u}',`));
}
main();
