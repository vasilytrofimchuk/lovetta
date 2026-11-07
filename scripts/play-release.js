#!/usr/bin/env node
// Google Play without the browser: upload the release bundle and put it on a track.
//   node scripts/play-release.js --show                         what is on every track (changes nothing)
//   node scripts/play-release.js --track internal [--bundle f]  upload + internal testing release
//   node scripts/play-release.js --track production --notes-en "…"
//   node scripts/play-release.js --track production --version 1     put an already uploaded bundle on a track
// Options: --package <id> (default ai.lovetta.app), --status draft|completed (default: draft while the app
//   has never been published, which Google requires), --name "<release name>".
// Login: the owner's Google account via OAuth (GOOGLE_PLAY_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN in
// /Users/vasily/projects/vseti/.env) — the same login that ships «В сети» and «Семья». Never printed.
// An upload to a release track replaces whatever is waiting in review on that track: check «Publishing
// overview» in the Console first when something is in review.
const fs = require('fs'), path = require('path');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = n => process.argv.includes(`--${n}`);
const die = (...a) => { console.error(...a); process.exit(1); };

const PKG = arg('package') || 'ai.lovetta.app';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;
const BUNDLE = arg('bundle') || path.join(__dirname, '..', 'web/android/app/build/outputs/bundle/release/app-release.aab');

function credentials() {
  const out = {};
  for (const f of ['/Users/vasily/projects/vseti/.env', path.join(__dirname, '..', 'secrets/play.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = /^(GOOGLE_PLAY_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  if (!out.GOOGLE_PLAY_REFRESH_TOKEN) die('no GOOGLE_PLAY_* login found');
  return out;
}

let auth;
async function token() {
  const c = credentials();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: c.GOOGLE_PLAY_CLIENT_ID, client_secret: c.GOOGLE_PLAY_CLIENT_SECRET,
    refresh_token: c.GOOGLE_PLAY_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!t.access_token) die('Play login refused:', t.error, t.error_description || '');
  return t.access_token;
}
async function api(method, url, body, raw) {
  const r = await fetch(url, { method, body: raw || (body ? JSON.stringify(body) : undefined),
    headers: { Authorization: auth, 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
async function must(what, p) { const r = await p; if (!r.ok) die(`${what} failed (${r.status}): ${r.text.slice(0, 600)}`); return r.json; }

(async () => {
  auth = 'Bearer ' + await token();
  const edit = (await must('create edit', api('POST', `${API}/edits`, {}))).id;
  const tracks = (await must('list tracks', api('GET', `${API}/edits/${edit}/tracks`))).tracks || [];
  for (const t of tracks) console.log(`${t.track}: ` + ((t.releases || []).map(r => `${r.name} [${r.status}] ${(r.versionCodes || []).join(',')}`).join('; ') || '—'));
  if (has('show')) { await api('DELETE', `${API}/edits/${edit}`); return; }

  const track = arg('track') || die('--track internal|alpha|beta|production');
  let up;
  if (arg('version')) {
    up = { versionCode: Number(arg('version')) };   // already uploaded bundle: just put it on this track
    console.log('using uploaded versionCode', up.versionCode);
  } else {
    if (!fs.existsSync(BUNDLE)) die('no bundle at', BUNDLE);
    console.log(`uploading ${path.basename(BUNDLE)} (${(fs.statSync(BUNDLE).size / 1e6).toFixed(1)} MB)…`);
    up = await must('bundle upload', api('POST', `${UPLOAD}/edits/${edit}/bundles?uploadType=media`, null, fs.readFileSync(BUNDLE)));
    console.log('uploaded versionCode', up.versionCode);
  }
  const published = tracks.some(t => (t.releases || []).some(r => r.status === 'completed'));
  const status = arg('status') || (published ? 'completed' : 'draft');
  const notes = arg('notes-en');
  await must('set track', api('PUT', `${API}/edits/${edit}/tracks/${track}`, { track, releases: [{
    name: arg('name') || `${up.versionCode}`, versionCodes: [String(up.versionCode)], status,
    ...(notes ? { releaseNotes: [{ language: 'en-US', text: notes }] } : {}) }] }));
  let c = await api('POST', `${API}/edits/${edit}:commit`, {});
  if (!c.ok && c.text.includes('changesNotSentForReview')) c = await api('POST', `${API}/edits/${edit}:commit?changesNotSentForReview=true`, {});
  if (!c.ok) die(`commit failed (${c.status}): ${c.text.slice(0, 600)}`);
  console.log(`committed: ${track} ← ${up.versionCode} [${status}]`);
})().catch(e => die(e.stack || e.message));
