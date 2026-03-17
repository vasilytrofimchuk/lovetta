#!/usr/bin/env node
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
const { uploadFromUrl } = require('../server/src/r2');
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const STYLES = [
  'A beautiful young woman with long glossy black hair, dark almond eyes, matte red lipstick, black off-shoulder top, dramatic studio portrait',
  'A gorgeous young woman with tight blonde ringlet curls, bright blue eyes, dimples, pastel pink top, airy outdoor portrait',
  'A stunning young woman with deep brown skin, long box braids with gold cuffs, warm brown eyes, white tank top, sunset portrait',
  'A lovely young woman with medium brown skin, shoulder-length wavy dark hair, green eyes, denim shirt, urban rooftop portrait',
];

async function main() {
  if (!FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1); }
  for (let i = 0; i < STYLES.length; i++) {
    console.log(`[${i+1}] Generating...`);
    try {
      const prompt = `${STYLES[i]}. Portrait photo, upper body, looking at camera, 20-25 years old adult woman, high quality, photorealistic. MANDATORY: The subject must be a clearly adult woman, 20+ years old.`;
      const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: { width: 768, height: 1024 }, num_images: 1 }),
      });
      if (!response.ok) throw new Error(`fal.ai ${response.status}: ${await response.text()}`);
      const result = await response.json();
      const falUrl = result.images?.[0]?.url;
      if (!falUrl) throw new Error('No image URL');
      const { url } = await uploadFromUrl(falUrl, 'avatars/custom', { extension: '.jpg' });
      console.log(`[${i+1}] ${url}`);
    } catch (err) { console.error(`[${i+1}] FAILED: ${err.message}`); }
  }
}
main();
