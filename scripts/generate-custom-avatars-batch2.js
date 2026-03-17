#!/usr/bin/env node
/**
 * Generate 30 more diverse avatar images (batch 2) for custom companion creation.
 * Adds to avatars/custom/ in R2.
 *
 * Usage: node scripts/generate-custom-avatars-batch2.js
 */

try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}

const { uploadFromUrl } = require('../server/src/r2');

const FAL_KEY = (process.env.FAL_KEY || '').trim();
const FAL_BASE = 'https://fal.run';

const STYLES = [
  // Blonde variations
  'A beautiful young woman with long platinum blonde straight hair, ice blue eyes, soft smile, white lace top, ethereal lighting portrait',
  'A gorgeous young woman with golden blonde curly hair, green eyes, cheerful laugh, yellow sundress, outdoor garden portrait',
  'A stunning young woman with dirty blonde wavy hair, brown eyes, confident smirk, leather jacket, city street portrait',
  'A lovely young woman with ash blonde hair in a ponytail, grey eyes, sporty look, workout top, bright lighting portrait',
  'A beautiful young woman with blonde highlights on brown hair, hazel eyes, natural makeup, casual tee, coffee shop portrait',
  // Brunette variations
  'A gorgeous young woman with long chocolate brown straight hair, dark brown eyes, warm smile, cozy cardigan, fireplace portrait',
  'A stunning young woman with medium brown wavy hair, amber eyes, playful expression, off-shoulder sweater, golden hour portrait',
  'A beautiful young woman with dark brown hair in loose curls, green eyes, gentle look, cream blouse, studio portrait',
  'A lovely young woman with chestnut brown hair and bangs, brown eyes, cute smile, striped top, park setting portrait',
  'A gorgeous young woman with espresso brown sleek hair, dark eyes, elegant expression, black dress, evening portrait',
  // Black hair variations
  'A stunning young woman with long straight jet black hair, dark eyes, serene expression, red silk top, dramatic lighting portrait',
  'A beautiful young woman with black wavy hair, brown eyes, bright smile, white crop top, beach sunset portrait',
  'A gorgeous young Korean woman with black hair in a bob, dark eyes, soft look, pastel pink top, minimalist portrait',
  'A lovely young woman with long black curly hair, dark brown eyes, confident pose, denim vest, urban portrait',
  'A beautiful young Indian woman with thick black hair, dark eyes, radiant smile, colorful traditional top, warm portrait',
  // Red/ginger variations
  'A stunning young woman with bright ginger hair and freckles, blue eyes, mischievous grin, green sweater, autumn portrait',
  'A beautiful young woman with deep burgundy red hair, hazel eyes, mysterious look, black turtleneck, moody portrait',
  'A gorgeous young woman with strawberry blonde hair in braids, light green eyes, sweet smile, plaid shirt, countryside portrait',
  'A lovely young woman with fiery red wavy hair, blue-green eyes, bold expression, leather top, night city portrait',
  'A beautiful young woman with auburn hair in a messy updo, brown eyes, artistic look, paint-stained apron, studio portrait',
  // Colorful/unique variations
  'A striking young woman with pastel pink hair, blue eyes, playful wink, kawaii style top, soft neon portrait',
  'A gorgeous young woman with deep purple hair, violet eyes, edgy look, choker necklace, cyberpunk lighting portrait',
  'A beautiful young woman with teal blue hair tips on black hair, dark eyes, cool expression, band tee, concert portrait',
  'A stunning young woman with rose gold ombre hair, hazel eyes, dreamy look, silk camisole, golden light portrait',
  'A lovely young woman with white-silver hair, pale blue eyes, ethereal look, sheer white top, fantasy lighting portrait',
  // Mixed/diverse
  'A beautiful young Middle Eastern woman with long dark wavy hair, deep brown eyes, warm smile, elegant earrings, golden hour portrait',
  'A gorgeous young Brazilian woman with brown skin, dark curly hair, bright smile, colorful top, tropical portrait',
  'A stunning young Japanese woman with long straight hair, dark eyes, cute smile, oversized sweater, cozy room portrait',
  'A beautiful young mixed-race woman with light brown curly hair, green eyes, glowing skin, denim jacket, street portrait',
  'A lovely young Scandinavian woman with light blonde straight hair, blue eyes, fresh face, knit sweater, winter light portrait',
];

async function generateOne(prompt) {
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

  console.log(`Generating ${STYLES.length} more custom avatars (batch 2)...\n`);

  const urls = [];
  for (let i = 0; i < STYLES.length; i++) {
    const num = String(i + 21).padStart(3, '0');
    console.log(`[${num}] Generating...`);
    try {
      const url = await generateOne(STYLES[i]);
      urls.push(url);
      console.log(`[${num}] ${url}`);
    } catch (err) {
      console.error(`[${num}] FAILED: ${err.message}`);
    }
  }

  console.log(`\n--- Generated ${urls.length} avatars (batch 2) ---`);
  urls.forEach(u => console.log(`  '${u}',`));
}

main();
