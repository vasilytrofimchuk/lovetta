#!/usr/bin/env node
// Google Play store listing without the browser: texts, icon, feature graphic, phone screenshots, contact.
//   node scripts/play-listing.js --config <listing.json>
// listing.json: { "package": "ai.lovetta.app", "language": "en-US", "title": "…", "shortDescription": "…",
//   "fullDescriptionFile": "…", "icon": "…png", "featureGraphic": "…png", "phoneScreenshots": ["…png"],
//   "contactEmail": "…", "contactWebsite": "…" }
// Same owner OAuth login as scripts/play-release.js. Images of a type are replaced as a set.
const fs = require('fs');
const path = require('path');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const die = (...a) => { console.error(...a); process.exit(1); };
const cfgPath = arg('config') || die('--config <listing.json>');
const C = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const rel = p => path.resolve(path.dirname(cfgPath), p);
const PKG = C.package;
const LANG = C.language || 'en-US';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;

function credentials() {
  const out = {};
  for (const f of ['/Users/vasily/projects/vseti/.env', path.join(__dirname, '..', 'secrets/play.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = /^(GOOGLE_PLAY_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}
let auth;
async function api(method, url, body, raw, type) {
  const r = await fetch(url, { method, body: raw || (body ? JSON.stringify(body) : undefined),
    headers: { Authorization: auth, 'Content-Type': type || 'application/json' } });
  const text = await r.text();
  if (!r.ok) die(`${method} ${url.replace(API, '').replace(UPLOAD, '')} failed (${r.status}): ${text.replace(/\s+/g, ' ').slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

(async () => {
  const c = credentials();
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: c.GOOGLE_PLAY_CLIENT_ID, client_secret: c.GOOGLE_PLAY_CLIENT_SECRET,
    refresh_token: c.GOOGLE_PLAY_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) die('Play login refused:', t.error);
  auth = 'Bearer ' + t.access_token;

  const edit = (await api('POST', `${API}/edits`, {})).id;
  if (C.contactEmail || C.contactWebsite) {
    await api('PATCH', `${API}/edits/${edit}/details`, { defaultLanguage: LANG,
      ...(C.contactEmail ? { contactEmail: C.contactEmail } : {}), ...(C.contactWebsite ? { contactWebsite: C.contactWebsite } : {}) });
    console.log('details set');
  }
  const full = C.fullDescriptionFile ? fs.readFileSync(rel(C.fullDescriptionFile), 'utf8').trim() : C.fullDescription;
  await api('PUT', `${API}/edits/${edit}/listings/${LANG}`, { language: LANG, title: C.title, shortDescription: C.shortDescription, fullDescription: full });
  console.log(`listing ${LANG}: title ${C.title.length}/30, short ${C.shortDescription.length}/80, full ${full.length}/4000`);

  const sets = [['icon', C.icon ? [C.icon] : []], ['featureGraphic', C.featureGraphic ? [C.featureGraphic] : []], ['phoneScreenshots', C.phoneScreenshots || []]];
  for (const [type, files] of sets) {
    if (!files.length) continue;
    await api('DELETE', `${API}/edits/${edit}/listings/${LANG}/${type}`);
    for (const f of files) await api('POST', `${UPLOAD}/edits/${edit}/listings/${LANG}/${type}?uploadType=media`, null, fs.readFileSync(rel(f)), 'image/png');
    console.log(`${type}: ${files.length} uploaded`);
  }

  let r = await fetch(`${API}/edits/${edit}:commit`, { method: 'POST', headers: { Authorization: auth } });
  let txt = await r.text();
  if (!r.ok && txt.includes('changesNotSentForReview')) {
    r = await fetch(`${API}/edits/${edit}:commit?changesNotSentForReview=true`, { method: 'POST', headers: { Authorization: auth } });
    txt = await r.text();
  }
  if (!r.ok) die(`commit failed (${r.status}): ${txt.replace(/\s+/g, ' ').slice(0, 500)}`);
  console.log('committed');
})().catch(e => die(e.stack || e.message));
