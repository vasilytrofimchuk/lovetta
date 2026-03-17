#!/usr/bin/env node
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
const { uploadFromUrl } = require('../server/src/r2');
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const STYLES = [
  // Young (20-22)
  'Anime style portrait of a cute 20 year old girl with long pink hair, big blue eyes, school uniform, cherry blossom background, high quality anime art',
  'Anime style portrait of a beautiful 21 year old girl with short silver hair, red eyes, black choker, dark outfit, moody lighting, detailed anime art',
  'Anime style portrait of a cheerful 20 year old girl with twin tails orange hair, green eyes, bright smile, casual clothes, sunny day, anime illustration',
  'Anime style portrait of a shy 22 year old girl with long dark blue hair, purple eyes, white dress, moonlit night, ethereal anime art',
  'Anime style portrait of a playful 21 year old girl with messy blonde hair, golden eyes, crop top, winking, colorful background, vibrant anime art',
  // Mid (23-25)
  'Anime style portrait of an elegant 24 year old woman with long straight black hair, crimson eyes, traditional kimono, sakura petals, beautiful anime art',
  'Anime style portrait of a confident 25 year old woman with short brown bob, amber eyes, business suit, city skyline, modern anime art',
  'Anime style portrait of a mysterious 23 year old woman with wavy purple hair, heterochromia eyes, gothic dress, candlelight, dark anime art',
  'Anime style portrait of a sporty 24 year old woman with ponytail red hair, emerald eyes, athletic wear, dynamic pose, energetic anime art',
  'Anime style portrait of a gentle 25 year old woman with long white hair, soft blue eyes, flower crown, garden setting, dreamy anime art',
  // Mature (26-30)
  'Anime style portrait of a sophisticated 28 year old woman with updo dark hair, sharp brown eyes, red lipstick, evening gown, glamorous anime art',
  'Anime style portrait of a fierce 27 year old woman with long scarlet hair, yellow eyes, leather jacket, urban night, edgy anime art',
  'Anime style portrait of a serene 30 year old woman with medium green hair, soft hazel eyes, flowing robes, waterfall background, peaceful anime art',
  'Anime style portrait of a charismatic 26 year old woman with wavy teal hair, violet eyes, off-shoulder top, sunset beach, warm anime art',
  'Anime style portrait of a mature 29 year old woman with sleek silver hair, ice blue eyes, fitted blazer, penthouse view, luxury anime art',
  // Mixed styles
  'Anime style portrait of a cute catgirl with fluffy pink ears, long lavender hair, big emerald eyes, maid outfit, kawaii anime art',
  'Anime style portrait of a cool 23 year old girl with half black half white hair, mismatched eyes, punk outfit, graffiti wall, stylish anime art',
  'Anime style portrait of a sweet 22 year old girl with long golden braids, sky blue eyes, medieval fantasy dress, castle background, fantasy anime art',
  'Anime style portrait of a badass 26 year old woman with short spiky red hair, amber eyes, military jacket, battle scars, action anime art',
  'Anime style portrait of a dreamy 24 year old girl with flowing aquamarine hair, starry eyes, celestial dress, galaxy background, magical anime art',
];

async function main() {
  if (!FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1); }
  console.log(`Generating ${STYLES.length} anime avatars...\n`);
  for (let i = 0; i < STYLES.length; i++) {
    console.log(`[${i+1}] Generating...`);
    try {
      const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: STYLES[i], image_size: { width: 768, height: 1024 }, num_images: 1 }),
      });
      if (!response.ok) throw new Error(`fal.ai ${response.status}: ${await response.text()}`);
      const result = await response.json();
      const falUrl = result.images?.[0]?.url;
      if (!falUrl) throw new Error('No image URL');
      const { url } = await uploadFromUrl(falUrl, 'avatars/anime', { extension: '.jpg' });
      console.log(`[${i+1}] ${url}`);
    } catch (err) { console.error(`[${i+1}] FAILED: ${err.message}`); }
  }
}
main();
