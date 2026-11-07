#!/usr/bin/env node
/**
 * Android launcher icons, adaptive icon and splash screens from the brand art.
 *
 *   node scripts/android-assets.js
 *
 * Sources: the pink "L" of the iOS app icon (web/ios/App/App/Assets.xcassets/AppIcon.appiconset) for
 * launcher icons, and the "Lovetta" wordmark of the iOS splash (Splash.imageset) for splash screens.
 * Each is cut out of its dark background and laid on the brand background #0f0a1a, so the icon fits
 * Android's round/squircle masks.
 * Also writes the Play listing icon (512) and feature graphic (1024x500) to web/android/play/.
 */
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const ICON_SRC = path.join(ROOT, 'web/ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-1024.png')
const SPLASH_SRC = path.join(ROOT, 'web/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png')
const RES = path.join(ROOT, 'web/android/app/src/main/res')
const PLAY = path.join(ROOT, 'web/android/play')
const BG = { r: 15, g: 10, b: 26 } // #0f0a1a
const BG_HEX = '#0f0a1a'

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

/** The glyph as RGBA on transparent, trimmed to its bounds. */
async function glyph(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let minx = width, miny = height, maxx = 0, maxy = 0, peak = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const r = data[i], g = data[i + 1]
      if (r - g > 40) {
        if (x < minx) minx = x; if (x > maxx) maxx = x
        if (y < miny) miny = y; if (y > maxy) maxy = y
        if (r > peak[0]) peak = [r, data[i + 1], data[i + 2]]
      }
    }
  }
  const pad = 8
  minx -= pad; miny -= pad; maxx += pad; maxy += pad
  const w = maxx - minx + 1, h = maxy - miny + 1
  const out = Buffer.alloc(w * h * 4)
  const span = Math.max(1, peak[0] - BG.r)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + miny) * width + (x + minx)) * 3
      const a = Math.max(0, Math.min(1, (data[i] - BG.r) / span))
      const o = (y * w + x) * 4
      out[o] = peak[0]; out[o + 1] = peak[1]; out[o + 2] = peak[2]; out[o + 3] = Math.round(a * 255)
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

/** Glyph centred on a canvas; `widthRatio` = glyph width / canvas width. */
async function composed(G, size, widthRatio, { background = BG, height = size } = {}) {
  const g = await sharp(G).resize({ width: Math.round(size * widthRatio) }).toBuffer()
  const meta = await sharp(g).metadata()
  return sharp({ create: { width: size, height, channels: 4, background: background === null ? { r: 0, g: 0, b: 0, alpha: 0 } : { ...background, alpha: 1 } } })
    .composite([{ input: g, left: Math.round((size - meta.width) / 2), top: Math.round((height - meta.height) / 2) }])
    .png()
}

async function write(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await img.toFile(file)
}

async function main() {
  const G = await glyph(ICON_SRC)
  const W = await glyph(SPLASH_SRC)

  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${d}`)
    // Adaptive foreground: 108dp canvas, glyph inside the 66dp safe circle.
    await write(await composed(G, Math.round(108 * k), 0.52, { background: null }), path.join(dir, 'ic_launcher_foreground.png'))
    // Legacy icons (Android 7): 48dp, square and round.
    const legacy = Math.round(48 * k)
    await write(await composed(G, legacy, 0.74), path.join(dir, 'ic_launcher.png'))
    const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`)
    const square = await (await composed(G, legacy, 0.66)).toBuffer()
    await write(sharp(square).composite([{ input: circle, blend: 'dest-in' }]).png(), path.join(dir, 'ic_launcher_round.png'))
  }

  // Android 12+ splash icon: 288dp canvas shown inside a 192dp circle, keep the L in the middle.
  for (const [d, k] of Object.entries(DENSITIES)) {
    await write(await composed(G, Math.round(288 * k), 0.42, { background: null }), path.join(RES, `drawable-${d}`, 'splash_icon.png'))
  }

  // Legacy splash (android:background of the launch theme), portrait and landscape.
  const splashSizes = {
    mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920],
  }
  for (const [d, [w, h]] of Object.entries(splashSizes)) {
    await write(await composed(W, w, 0.6, { height: h }), path.join(RES, `drawable-port-${d}`, 'splash.png'))
    await write(await composed(W, h, 0.36, { height: w }), path.join(RES, `drawable-land-${d}`, 'splash.png'))
  }
  await write(await composed(W, 480, 0.6, { height: 800 }), path.join(RES, 'drawable', 'splash.png'))

  // Play listing art.
  await write((await composed(G, 512, 0.7)).flatten({ background: BG_HEX }), path.join(PLAY, 'icon-512.png'))
  await write((await composed(W, 1024, 0.56, { height: 500 })).flatten({ background: BG_HEX }), path.join(PLAY, 'feature-graphic-1024x500.png'))

  console.log('android assets written')
}

main().catch((err) => { console.error(err); process.exit(1) })
