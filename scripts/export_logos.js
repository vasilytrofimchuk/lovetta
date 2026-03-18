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
const IOS_ICON_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const IOS_ASSETS_DIR = path.join(__dirname, '..', 'web', 'ios', 'App', 'App', 'Assets.xcassets');
const IOS_PREVIEW_DIR = path.join(__dirname, '..', 'web', 'public', 'assets', 'app-icons', 'ios');
const LEGACY_IOS_ICONSETS = ['AppIconIvory.appiconset', 'AppIconBlue.appiconset'];
const LEGACY_IOS_PREVIEWS = ['ivory.png', 'blue.png'];
const IOS_ICON_FILES = {
  20: 'Icon-20.png',
  29: 'Icon-29.png',
  40: 'Icon-40.png',
  58: 'Icon-58.png',
  60: 'Icon-60.png',
  76: 'Icon-76.png',
  80: 'Icon-80.png',
  87: 'Icon-87.png',
  120: 'Icon-120.png',
  152: 'Icon-152.png',
  167: 'Icon-167.png',
  180: 'Icon-180.png',
  1024: 'Icon-1024.png',
};
const IOS_ICONSET_CONTENTS = {
  images: [
    { idiom: 'iphone', scale: '2x', size: '20x20', filename: 'Icon-40.png' },
    { idiom: 'iphone', scale: '3x', size: '20x20', filename: 'Icon-60.png' },
    { idiom: 'iphone', scale: '2x', size: '29x29', filename: 'Icon-58.png' },
    { idiom: 'iphone', scale: '3x', size: '29x29', filename: 'Icon-87.png' },
    { idiom: 'iphone', scale: '2x', size: '40x40', filename: 'Icon-80.png' },
    { idiom: 'iphone', scale: '3x', size: '40x40', filename: 'Icon-120.png' },
    { idiom: 'iphone', scale: '2x', size: '60x60', filename: 'Icon-120.png' },
    { idiom: 'iphone', scale: '3x', size: '60x60', filename: 'Icon-180.png' },
    { idiom: 'ipad', scale: '1x', size: '20x20', filename: 'Icon-20.png' },
    { idiom: 'ipad', scale: '2x', size: '20x20', filename: 'Icon-40.png' },
    { idiom: 'ipad', scale: '1x', size: '29x29', filename: 'Icon-29.png' },
    { idiom: 'ipad', scale: '2x', size: '29x29', filename: 'Icon-58.png' },
    { idiom: 'ipad', scale: '1x', size: '40x40', filename: 'Icon-40.png' },
    { idiom: 'ipad', scale: '2x', size: '40x40', filename: 'Icon-80.png' },
    { idiom: 'ipad', scale: '1x', size: '76x76', filename: 'Icon-76.png' },
    { idiom: 'ipad', scale: '2x', size: '76x76', filename: 'Icon-152.png' },
    { idiom: 'ipad', scale: '2x', size: '83.5x83.5', filename: 'Icon-167.png' },
    { idiom: 'ios-marketing', scale: '1x', size: '1024x1024', filename: 'Icon-1024.png' },
  ],
  info: {
    author: 'xcode',
    version: 1,
  },
};
const IOS_ICON_VARIANTS = [
  {
    id: 'default',
    label: 'Default',
    iconSet: 'AppIcon',
    preview: 'default.png',
    state: {
      fontFamily: 'Tangerine',
      fontWeight: '400',
      fontSlant: -3,
      color1: '#ec4899',
      color2: '#f43f5e',
      gradAngle: 180,
      iconBg: 'color',
      iconBgColor: '#110a10',
      iconRadius: 22,
    },
  },
  {
    id: 'black',
    label: 'Black',
    iconSet: 'AppIconBlack',
    preview: 'black.png',
    state: {
      fontFamily: 'Tangerine',
      fontWeight: '400',
      fontSlant: -3,
      color1: '#f3f4f6',
      color2: '#d1d5db',
      gradAngle: 180,
      iconBg: 'color',
      iconBgColor: '#121212',
      iconRadius: 22,
    },
  },
  {
    id: 'silver',
    label: 'Silver',
    iconSet: 'AppIconSilver',
    preview: 'silver.png',
    state: {
      fontFamily: 'Arial',
      fontWeight: '700',
      fontSlant: 0,
      color1: '#f8fafc',
      color2: '#f8fafc',
      gradAngle: 180,
      iconBg: 'color',
      iconBgColor: '#9ca3af',
      iconFontSize: 68,
      iconOffX: -1,
      iconOffY: 2,
      iconRadius: 22,
    },
  },
];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(IOS_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(IOS_PREVIEW_DIR, { recursive: true });

  LEGACY_IOS_ICONSETS.forEach((dir) => {
    const target = path.join(IOS_ASSETS_DIR, dir);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  });
  LEGACY_IOS_PREVIEWS.forEach((file) => {
    const target = path.join(IOS_PREVIEW_DIR, file);
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  });

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

  // logo_l.png (1024x1024, with rounded corners for web use)
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

  console.log('Exporting neutral iOS icon sets...');
  for (const variant of IOS_ICON_VARIANTS) {
    await applyEditorState(page, variant.state);
    await exportIosIconSet(page, variant);
    await exportIosPreview(page, variant);
  }

  await browser.close();
  console.log(`\nAll assets exported to ${OUTPUT_DIR}`);
}

async function applyEditorState(page, overrides) {
  await page.evaluate((state) => {
    const merged = {
      fontFamily: 'Tangerine',
      fontWeight: '400',
      fontSlant: 0,
      color1: '#f472b6',
      color2: '#a855f7',
      gradAngle: 160,
      bgColor: 'transparent',
      iconBg: 'color',
      iconBgColor: '#110c1e',
      iconFontSize: 82,
      iconOffX: -2,
      iconOffY: 5,
      iconRadius: 22,
      ...state,
    };

    Object.entries(merged).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input) return;

      input.value = String(value);

      const picker = document.getElementById(`${id}Pick`);
      if (picker && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
        picker.value = value;
      }

      const valueLabel = document.getElementById(`${id}Val`);
      if (valueLabel) {
        const suffix = id === 'gradAngle' || id === 'fontSlant' ? '°' : '%';
        valueLabel.textContent = `${value}${suffix}`;
      }
    });

    updatePreviewBg();
    renderAll();
  }, overrides);
  await page.waitForTimeout(100);
}

async function exportIosIconSet(page, variant) {
  const iconSetDir = path.join(IOS_ASSETS_DIR, `${variant.iconSet}.appiconset`);
  fs.mkdirSync(iconSetDir, { recursive: true });
  fs.writeFileSync(path.join(iconSetDir, 'Contents.json'), `${JSON.stringify(IOS_ICONSET_CONTENTS, null, 2)}\n`);

  const legacyPreview = path.join(iconSetDir, 'AppIcon-512@2x.png');
  if (fs.existsSync(legacyPreview)) {
    fs.rmSync(legacyPreview);
  }

  for (const size of IOS_ICON_SIZES) {
    const dataUrl = await page.evaluate((sz) => {
      const originalRadius = document.getElementById('iconRadius').value;
      document.getElementById('iconRadius').value = 0;
      const canvas = document.createElement('canvas');
      renderIconToCanvas(canvas, sz);
      document.getElementById('iconRadius').value = originalRadius;
      return canvas.toDataURL('image/png');
    }, size);

    const filename = IOS_ICON_FILES[size];
    fs.writeFileSync(path.join(iconSetDir, filename), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }

  console.log(`  ${variant.iconSet}.appiconset`);
}

async function exportIosPreview(page, variant) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    renderIconToCanvas(canvas, 512);
    return canvas.toDataURL('image/png');
  });
  fs.writeFileSync(
    path.join(IOS_PREVIEW_DIR, variant.preview),
    Buffer.from(dataUrl.split(',')[1], 'base64')
  );
  console.log(`  preview ${variant.preview}`);
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
