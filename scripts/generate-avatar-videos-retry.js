#!/usr/bin/env node
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
const { uploadFromUrl } = require('../server/src/r2');
const FAL_KEY = (process.env.FAL_KEY || '').trim();
const R2C = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/custom';
const R2A = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/anime';
const PROMPT_REAL = 'A beautiful young woman looking at camera with a gentle smile, subtle natural movement, slight hair sway, soft breathing, warm cinematic lighting, portrait video';
const PROMPT_ANIME = 'Anime girl portrait, subtle movement, gentle hair sway, blinking eyes, soft breathing, warm lighting, high quality anime animation';
const MODEL = 'wan/v2.6/image-to-video';

const FAILED = [
  { type: 'R2C', id: 'e7ab31ca-6cea-4db6-9b2c-af630831a078' }, // wait this is R2A
  { type: 'R2C', id: '2ec7e41e-3a7b-44c5-be35-490b3eb8d1a4' },
  { type: 'R2A', id: 'f65a5836-622b-4d8a-8eb6-3ebd3e629974' },
  { type: 'R2C', id: 'e2d0327f-c888-48d4-b73e-83b531dc3cd6' },
  { type: 'R2C', id: '250ad133-7ecb-420d-b216-1fdb6fb44ed3' },
  { type: 'R2C', id: '38490e1d-0cab-4d91-953c-9956f225b40a' },
  { type: 'R2C', id: '3b9b72ea-aae7-46d0-b896-f286019f8d21' },
  { type: 'R2C', id: '09360191-090e-406b-913b-2c25ae11c4d1' },
  { type: 'R2C', id: 'dfec0ad5-024c-4404-8d31-0c7ad302be6c' },
  { type: 'R2C', id: '91de6f92-5d82-4b1f-b99f-1f4ed51bdc6d' },
  { type: 'R2C', id: '16a39999-1ecd-469a-88ee-a003f681a4de' },
  { type: 'R2C', id: 'df44b709-61c6-4e48-a466-5afc439ce08d' },
  { type: 'R2C', id: '0c383558-e595-452a-8179-ecf6ed679404' },
  { type: 'R2C', id: 'aa9dd6ae-2647-4e21-af11-dc9401391489' },
  { type: 'R2C', id: 'bd068b08-3ce1-4065-a502-6a3132c91926' },
  { type: 'R2A', id: 'e33f2af8-6c60-4160-b72e-b81da64c8063' },
  { type: 'R2A', id: '46365b8f-c41e-4e15-8e6f-03cc452b30fe' },
  { type: 'R2C', id: '8d625ef6-edd3-4bb9-a1ff-a309fc6d2f47' },
  { type: 'R2C', id: '24daf5e0-0768-45cd-a952-da084ec80bbb' },
  { type: 'R2C', id: 'fd2975be-ec58-4393-88f9-8aa55f857a97' },
  { type: 'R2C', id: '2b070d04-4532-41a0-ae80-2e451606aba5' },
  { type: 'R2C', id: 'd2c56ab0-f19f-4264-be70-35761acaf921' },
  { type: 'R2C', id: '7e81de2d-1f50-41a3-8564-820e1d971da8' },
  { type: 'R2C', id: '0b01e9d3-9adb-4e7f-a8d9-fb26a37d79e2' },
  { type: 'R2C', id: '0de421d8-a44c-4148-9d20-d930ce08ae94' },
];

// Fix: e7ab31ca is actually R2A
FAILED[0].type = 'R2A';

async function submitJob(avatar) {
  const base = avatar.type === 'R2A' ? R2A : R2C;
  const imageUrl = `${base}/${avatar.id}.jpg`;
  const prompt = avatar.type === 'R2A' ? PROMPT_ANIME : PROMPT_REAL;
  const res = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, prompt, duration: '5', resolution: '720p' }),
  });
  if (!res.ok) throw new Error(`submit ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function pollResult(job) {
  const maxWait = 600000; // 10 min
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(job.status_url, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
    if (!res.ok) continue;
    const status = await res.json();
    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(job.response_url, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      const result = await resultRes.json();
      const falUrl = result.video?.url || result.url;
      if (!falUrl) throw new Error('no video url');
      const { url } = await uploadFromUrl(falUrl, 'videos/avatars/custom', { extension: '.mp4' });
      return url;
    }
    if (status.status === 'FAILED') throw new Error('failed');
  }
  throw new Error('timeout');
}

async function main() {
  console.log(`Retrying ${FAILED.length} failed jobs...\n`);
  const jobs = await Promise.allSettled(FAILED.map(async (a, i) => {
    try {
      const job = await submitJob(a);
      console.log(`[${a.id.slice(0,8)}] submitted`);
      return { ...a, ...job };
    } catch (e) { console.error(`[${a.id.slice(0,8)}] submit fail: ${e.message}`); return null; }
  }));
  const submitted = jobs.filter(r => r.value).map(r => r.value);
  console.log(`\n${submitted.length} submitted, polling...\n`);
  const results = await Promise.allSettled(submitted.map(async job => {
    try {
      const video = await pollResult(job);
      console.log(`${job.id} → ${video}`);
      return { id: job.id, video };
    } catch (e) { console.error(`[${job.id.slice(0,8)}] ✗ ${e.message}`); return null; }
  }));
  const ok = results.filter(r => r.value?.video).map(r => r.value);
  console.log(`\nDone: ${ok.length}/${FAILED.length}`);
}
main();
