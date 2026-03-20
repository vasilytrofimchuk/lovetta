#!/usr/bin/env node
// Serves the ads editor + converts WebM to MP4 via system ffmpeg
// Usage: node scripts/ads_server.js
// Opens: http://localhost:8111/scripts/ads_editor.html

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8111;
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.wasm': 'application/wasm', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  // POST /convert — WebM body in, MP4 body out
  if (req.method === 'POST' && req.url === '/convert') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const webm = Buffer.concat(chunks);
      const tmpIn = path.join(ROOT, 'scripts', `_tmp_${Date.now()}.webm`);
      const tmpOut = tmpIn.replace('.webm', '.mp4');
      try {
        fs.writeFileSync(tmpIn, webm);
        execSync(`ffmpeg -y -i "${tmpIn}" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 23 "${tmpOut}"`, { timeout: 30000 });
        const mp4 = fs.readFileSync(tmpOut);
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length });
        res.end(mp4);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('ffmpeg failed: ' + e.message);
      } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
      }
    });
    return;
  }

  // POST /render-video — composite overlay PNG + girl video → MP4
  if (req.method === 'POST' && req.url === '/render-video') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        // Parse multipart form data — handle binary properly
        const boundaryStr = req.headers['content-type'].split('boundary=')[1];
        const boundary = Buffer.from('--' + boundaryStr);
        const parts = {};

        // Find each part by boundary
        let pos = 0;
        while (true) {
          const start = raw.indexOf(boundary, pos);
          if (start === -1) break;
          const nextBoundary = raw.indexOf(boundary, start + boundary.length + 2);
          if (nextBoundary === -1) break;

          const partBuf = raw.slice(start + boundary.length + 2, nextBoundary - 2); // skip \r\n at start, \r\n before next boundary
          const headerEnd = partBuf.indexOf('\r\n\r\n');
          if (headerEnd === -1) { pos = nextBoundary; continue; }

          const header = partBuf.slice(0, headerEnd).toString('utf8');
          const body = partBuf.slice(headerEnd + 4);
          const nameMatch = header.match(/name="([^"]+)"/);
          if (!nameMatch) { pos = nextBoundary; continue; }

          if (header.includes('filename=')) {
            parts[nameMatch[1]] = body;
          } else {
            parts[nameMatch[1]] = body.toString('utf8').trim();
          }
          pos = nextBoundary;
        }

        const girl = parts.girl;
        const dur = Math.min(parseInt(parts.duration) || 6, 15);
        const cardX = parseInt(parts.cardX) || 260;
        const cardY = parseInt(parts.cardY) || 16;
        const cardW = parseInt(parts.cardW) || 320;
        const cardH = parseInt(parts.cardH) || 427;

        const videoPath = path.join(ROOT, 'public', 'assets', 'ads', 'videos', girl + '.mp4');
        if (!fs.existsSync(videoPath)) { res.writeHead(404); res.end('No video for ' + girl); return; }

        const ts = Date.now();
        const overlayPath = path.join(ROOT, 'scripts', `_overlay_${ts}.png`);
        const outPath = path.join(ROOT, 'scripts', `_render_${ts}.mp4`);
        fs.writeFileSync(overlayPath, parts.overlay);
        console.log(`Overlay: ${parts.overlay.length} bytes, girl=${parts.girl}, cardX=${cardX}, cardY=${cardY}, cardW=${cardW}, cardH=${cardH}`);
        // Debug: keep a copy

        // Output at 1x (300x250). Overlay is 2x (600x500), scale everything down.
        const W = 300, H = 250;
        const cX = Math.round(cardX / 2), cY = Math.round(cardY / 2);
        const cW = Math.round(cardW / 2), cH = Math.round(cardH / 2);

        const cmd = [
          'ffmpeg', '-y',
          '-i', `"${videoPath}"`,
          '-i', `"${overlayPath}"`,
          '-filter_complex',
          `"[0:v]scale=${cW}:${cH}:force_original_aspect_ratio=increase,crop=${cW}:${cH},setpts=PTS-STARTPTS[vid];` +
          `[1:v]scale=${W}:${H}[ovr];` +
          `color=c=0x0a0618:s=${W}x${H}:d=${dur}:r=30[bg];` +
          `[bg][vid]overlay=${cX}:${cY}:shortest=1[base];` +
          `[base][ovr]overlay=0:0"`,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
          '-t', String(dur), '-an',
          `"${outPath}"`,
        ].join(' ');

        console.log('Rendering video banner...');
        execSync(cmd, { timeout: 60000, stdio: 'pipe' });
        const mp4 = fs.readFileSync(outPath);
        console.log(`Video rendered: ${(mp4.length / 1024).toFixed(0)} KB`);
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length });
        res.end(mp4);
        try { fs.unlinkSync(overlayPath); } catch {}
        try { fs.unlinkSync(outPath); } catch {}
      } catch (e) {
        console.error('Render failed:', e.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Render failed: ' + e.message);
      }
    });
    return;
  }

  // POST /render-card-video?girl=sophia&duration=5 — just the girl video, no overlay
  if (req.method === 'POST' && req.url.startsWith('/render-card-video')) {
    const params = new URL(req.url, 'http://x').searchParams;
    const girl = params.get('girl');
    const dur = Math.min(parseInt(params.get('duration')) || 5, 15);
    if (!girl) { res.writeHead(400); res.end('Missing girl'); return; }
    const videoPath = path.join(ROOT, 'public', 'assets', 'ads', 'videos', girl + '.mp4');
    if (!fs.existsSync(videoPath)) { res.writeHead(404); res.end('No video for ' + girl); return; }
    const outPath = path.join(ROOT, 'scripts', `_cardvid_${Date.now()}.mp4`);
    try {
      const cmd = `ffmpeg -y -i "${videoPath}" -vf "scale=300:250:force_original_aspect_ratio=increase,crop=300:250" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -t ${dur} -an "${outPath}"`;
      execSync(cmd, { timeout: 30000, stdio: 'pipe' });
      const mp4 = fs.readFileSync(outPath);
      console.log(`Card-only video: ${girl} ${(mp4.length / 1024).toFixed(0)} KB`);
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length });
      res.end(mp4);
    } catch (e) {
      res.writeHead(500); res.end('ffmpeg failed: ' + e.message);
    } finally {
      try { fs.unlinkSync(outPath); } catch {}
    }
    return;
  }

  // GET /proxy-video?url=... — proxy R2 video to avoid CORS
  if ((req.method === 'GET' || req.method === 'HEAD') && req.url.startsWith('/proxy-video')) {
    const url = new URL(req.url, 'http://x').searchParams.get('url');
    if (!url || !url.includes('r2.dev')) { res.writeHead(400); res.end('Bad url'); return; }
    const https = require('https');
    https.get(url, (proxyRes) => {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=86400' });
      proxyRes.pipe(res);
    }).on('error', (e) => { res.writeHead(500); res.end(e.message); });
    return;
  }

  // POST /save-card?name=sophia — save PNG as card image
  if (req.method === 'POST' && req.url.startsWith('/save-card')) {
    const name = new URL(req.url, 'http://x').searchParams.get('name');
    if (!name || !/^[a-z]+$/.test(name)) { res.writeHead(400); res.end('Bad name'); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const png = Buffer.concat(chunks);
      const dest = path.join(ROOT, 'public', 'assets', 'ads', name + '.png');
      fs.writeFileSync(dest, png);
      console.log(`Saved card: ${dest} (${(png.length / 1024).toFixed(0)} KB)`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }

  // Static file server
  let filePath = path.join(ROOT, req.url === '/' ? '/scripts/ads_editor.html' : req.url);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
  res.end(data);
});

server.listen(PORT, () => {
  console.log(`Ads editor: http://localhost:${PORT}/scripts/ads_editor.html`);
  console.log('MP4 conversion enabled (ffmpeg required)');
});
