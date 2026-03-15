#!/usr/bin/env node

/**
 * Generate favicon sizes and OG image from logo.png
 */

const sharp = require('sharp');
const path = require('path');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const LOGO = path.join(BRAND_DIR, 'logo.png');

async function main() {
  // Favicon sizes
  const sizes = [
    { size: 16, name: 'icon-16.png' },
    { size: 32, name: 'icon-32.png' },
    { size: 180, name: 'icon-180.png' },
  ];

  for (const { size, name } of sizes) {
    await sharp(LOGO)
      .resize(size, size)
      .png()
      .toFile(path.join(BRAND_DIR, name));
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // favicon.ico (32x32 PNG renamed — browsers accept PNG favicons)
  await sharp(LOGO)
    .resize(32, 32)
    .png()
    .toFile(path.join(BRAND_DIR, 'favicon.ico'));
  console.log('Generated favicon.ico');

  // OG image (1200x630) — logo centered on dark background
  const logoResized = await sharp(LOGO)
    .resize(300, 300)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 15, g: 10, b: 26, alpha: 1 }, // #0f0a1a
    },
  })
    .composite([
      {
        input: logoResized,
        top: Math.round((630 - 300) / 2),
        left: Math.round((1200 - 300) / 2),
      },
    ])
    .png()
    .toFile(path.join(BRAND_DIR, 'og-image.png'));
  console.log('Generated og-image.png (1200x630)');

  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
