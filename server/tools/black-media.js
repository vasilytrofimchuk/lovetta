/**
 * Black pictures in the media catalog (card #17, 07.11.2026).
 *
 * Until the fix of 08.10.2026 some generated pictures were saved fully black. The catalog
 * (companion_media) is where a companion's «photo» is reused from (media-chat.js findReusableMedia),
 * so a black one could be sent into a chat again. This finds them by brightness and removes them
 * from the catalog together with the videos made from them. Files and old chat messages stay:
 * what was sent stays in history, it just is not reused.
 *
 *   node server/tools/black-media.js                      dry run: counts and examples
 *   node server/tools/black-media.js --apply <backup.json>  save the rows to <backup.json>, then delete them
 *
 * «Black» = every channel's mean below 8 of 255 on a 64-px thumbnail.
 */
const fs = require('fs');
const sharp = require('sharp');
const { getPool } = require('../src/db');

const THRESHOLD = 8;
const PARALLEL = 8;

async function brightness(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { channels } = await sharp(buf).resize(64, 64, { fit: 'inside' }).removeAlpha().stats();
  return Math.max(...channels.map((c) => c.mean));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  const backup = apply ? args[1] : null;
  if (apply && !backup) throw new Error('--apply needs a backup file path');
  const pool = getPool();
  const { rows: images } = await pool.query(`SELECT id, media_url, created_at FROM companion_media WHERE media_type = 'image' ORDER BY created_at`);
  console.log(`${images.length} pictures in the catalog`);

  const black = [];
  const failed = [];
  let next = 0;
  let seen = 0;
  async function worker() {
    while (next < images.length) {
      const img = images[next++];
      try {
        const b = await brightness(img.media_url);
        if (b < THRESHOLD) black.push({ ...img, brightness: Math.round(b * 10) / 10 });
      } catch (err) {
        failed.push({ id: img.id, error: err.message });
      }
      if (++seen % 250 === 0) console.log(`  ${seen}/${images.length} checked, ${black.length} black`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const ids = black.map((b) => b.id);
  const { rows: videos } = ids.length
    ? await pool.query(`SELECT id FROM companion_media WHERE media_type = 'video' AND source_image_id = ANY($1::uuid[])`, [ids])
    : { rows: [] };
  const afterFix = black.filter((b) => new Date(b.created_at) >= new Date('2026-10-08')).length;
  console.log(`black: ${black.length} pictures (${afterFix} after 08.10), ${videos.length} videos made from them; ${failed.length} could not be read`);
  // The darkest-but-not-pure-black ones are the ones to look at with your own eyes before deleting.
  const sample = [...black].sort((a, b) => b.brightness - a.brightness).slice(0, 10);
  console.log(`pure black: ${black.filter((b) => b.brightness === 0).length}; brightest of the rest:`);
  for (const b of sample) console.log(`  ${b.brightness}  ${b.created_at.toISOString().slice(0, 10)}  ${b.media_url}`);
  if (failed.length) console.log('  unreadable (left alone):', JSON.stringify(failed.slice(0, 5)));

  if (!apply || !ids.length) { await pool.end(); return; }
  const all = [...videos.map((v) => v.id), ...ids];
  const { rows: full } = await pool.query(`SELECT * FROM companion_media WHERE id = ANY($1::uuid[])`, [all]);
  fs.writeFileSync(backup, JSON.stringify(full));
  console.log(`saved ${full.length} rows to ${backup}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A row that is somebody's source_image_id but not in our list keeps a dangling link otherwise.
    await client.query(`UPDATE companion_media SET source_image_id = NULL WHERE source_image_id = ANY($1::uuid[]) AND NOT (id = ANY($2::uuid[]))`, [ids, all]);
    const v = await client.query(`DELETE FROM companion_media WHERE id = ANY($1::uuid[]) AND media_type = 'video'`, [videos.map((x) => x.id)]);
    const i = await client.query(`DELETE FROM companion_media WHERE id = ANY($1::uuid[]) AND media_type = 'image'`, [ids]);
    await client.query('COMMIT');
    console.log(`deleted ${i.rowCount} pictures and ${v.rowCount} videos from the catalog`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
