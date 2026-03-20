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
