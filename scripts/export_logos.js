#!/usr/bin/env node
/**
 * Export all brand assets from logo_editor.html using Playwright.
 * Uses the HTML canvas renderer as the single source of truth.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EDITOR_PATH = path.join(__dirname, 'logo_editor.html');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const ICON_SIZES = [16, 32, 64, 128, 180, 512];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + EDITOR_PATH);
  await page.waitForTimeout(2000); // wait for fonts to load

  // Icons
  console.log('Exporting icons...');
  for (const size of ICON_SIZES) {
    const dataUrl = await page.evaluate((sz) => {
      const c = document.createElement('canvas');
      renderIconToCanvas(c, sz);
      return c.toDataURL('image/png');
    }, size);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUTPUT_DIR, `icon-${size}.png`), buf);
    console.log(`  icon-${size}.png`);
  }

  // logo_l.png (1024x1024)
  const logoLUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    renderIconToCanvas(c, 1024);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'logo_l.png'), Buffer.from(logoLUrl.split(',')[1], 'base64'));
  console.log('  logo_l.png');

  // Favicon.ico (multi-size)
  console.log('Exporting favicon...');
  const icoSizes = [16, 32, 64];
  const icoPngs = [];
  for (const sz of icoSizes) {
    const dataUrl = await page.evaluate((s) => {
      const c = document.createElement('canvas');
      renderIconToCanvas(c, s);
      return c.toDataURL('image/png');
    }, sz);
    icoPngs.push(Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'favicon.ico'), buildIco(icoPngs, icoSizes));
  console.log('  favicon.ico');

  // Text logo (cropped, transparent bg)
  console.log('Exporting logo text...');
  const textLogoUrl = await page.evaluate(() => {
    const origBg = document.getElementById('bgColor').value;
    document.getElementById('bgColor').value = 'transparent';
    const c = render(true);
    document.getElementById('bgColor').value = origBg;

    // Crop to non-transparent pixels
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let top = c.height, left = c.width, right = 0, bottom = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 0) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    const pad = 4;
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(c.width, right + pad + 1);
    bottom = Math.min(c.height, bottom + pad + 1);

    const cropped = document.createElement('canvas');
    cropped.width = right - left;
    cropped.height = bottom - top;
    cropped.getContext('2d').drawImage(c, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    return cropped.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'logo_text.png'), Buffer.from(textLogoUrl.split(',')[1], 'base64'));
  console.log('  logo_text.png');

  // OG/social card
  console.log('Exporting social card...');
  const ogUrl = await page.evaluate(() => {
    const c = renderSocial(true);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'og-image.png'), Buffer.from(ogUrl.split(',')[1], 'base64'));
  console.log('  og-image.png');

  await browser.close();
  console.log(`\nAll assets exported to ${OUTPUT_DIR}`);
}

function buildIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * numImages;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  for (let i = 0; i < numImages; i++) {
    const entry = Buffer.alloc(dirEntrySize);
    const sz = sizes[i] >= 256 ? 0 : sizes[i];
    entry.writeUInt8(sz, 0);
    entry.writeUInt8(sz, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += pngBuffers[i].length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
