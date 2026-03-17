#!/usr/bin/env node
/**
 * Generate videos for all custom avatars that don't have one yet.
 * Reads avatar URLs from stdin (one per line: TYPE ID), generates video, prints result.
 * Usage: node scripts/generate-avatar-videos-batch.js
 * Cost: ~$0.25 per video
 */
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
const { generateVideo } = require('../server/src/ai');

const R2C = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/custom';
const R2A = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/anime';

const PROMPT_REAL = 'A beautiful young woman looking at camera with a gentle smile, subtle natural movement, slight hair sway, soft breathing, warm cinematic lighting, portrait video';
const PROMPT_ANIME = 'Anime girl portrait, subtle movement, gentle hair sway, blinking eyes, soft breathing, warm lighting, high quality anime animation';

const AVATARS = [
  // Realistic without videos (lines 22-88 of CompanionCreate.jsx)
  { type: 'R2C', id: '91de6f92-5d82-4b1f-b99f-1f4ed51bdc6d' },
  { type: 'R2C', id: 'd0159b29-ba4e-47cf-abbc-8d213854c915' },
  { type: 'R2C', id: '238e014a-fcb2-4ce7-8eee-7b67cb18e587' },
  { type: 'R2C', id: '05f74a7f-db7c-4151-aed0-c96dd90aca19' },
  { type: 'R2C', id: '0de421d8-a44c-4148-9d20-d930ce08ae94' },
  { type: 'R2C', id: 'e2d0327f-c888-48d4-b73e-83b531dc3cd6' },
  { type: 'R2C', id: '94b792fb-265f-4832-b374-411d2cbcc326' },
  { type: 'R2C', id: 'd635aa3f-38b5-4fa0-bfca-f14be668a252' },
  { type: 'R2C', id: '5580f18d-0ead-403f-9e35-4e02ab3f04d6' },
  { type: 'R2C', id: '7df9390d-4dd0-47b6-8303-34caa28612a7' },
  { type: 'R2C', id: 'ebe3416f-71c4-4b88-9e22-85ad32dca153' },
  { type: 'R2C', id: 'c80ac2b1-135c-4e51-9ddb-c01f9d170bfd' },
  { type: 'R2C', id: '42e57b22-83a0-46d9-a968-a3a472d8e9a3' },
  { type: 'R2C', id: '79d337a2-85c6-4c3e-a73b-0dc0d46a20a5' },
  { type: 'R2C', id: 'bd068b08-3ce1-4065-a502-6a3132c91926' },
  { type: 'R2C', id: '3b9b72ea-aae7-46d0-b896-f286019f8d21' },
  { type: 'R2C', id: 'f4121b7c-7231-4ac8-8559-d076e8c30a91' },
  { type: 'R2C', id: '05411fae-297f-4a22-8574-a96f59563fbf' },
  { type: 'R2C', id: 'b151fb54-edc1-43fb-9694-a87e425410a0' },
  { type: 'R2C', id: 'aa1520b2-b727-432d-b6ad-749c3eb61a7d' },
  { type: 'R2C', id: '55a0c623-5552-46b9-af3c-47782c6bd0c4' },
  { type: 'R2C', id: 'ab17ffa5-be42-4c9f-8f50-2a3be0c3664b' },
  { type: 'R2C', id: 'a4b12f77-3d2c-4363-ac32-1d56e46e6a12' },
  { type: 'R2C', id: 'cb8991af-4a6b-4e76-b89c-bdac8d4d9287' },
  { type: 'R2C', id: 'c8be6ef7-009f-48fe-87c2-0a99e96c14f1' },
  { type: 'R2C', id: '33bdc7e6-d0e2-4f4a-b415-eab3ae5d734b' },
  { type: 'R2C', id: '6666fce3-8632-4031-9278-8b22fe76fea7' },
  { type: 'R2C', id: 'df44b709-61c6-4e48-a466-5afc439ce08d' },
  { type: 'R2C', id: 'cacb021b-0727-4db8-b6d5-18589ce1e447' },
  { type: 'R2C', id: 'a3e87986-9d4e-4e37-bc79-ecd39913d902' },
  { type: 'R2C', id: '14b04dd1-2e0c-4b4e-9cb3-2c189b8ff9be' },
  { type: 'R2C', id: 'e3835dc6-2116-4d91-9178-4f79a18a4378' },
  { type: 'R2C', id: '8cc825e4-843b-4de7-b0ab-4f2acffcc006' },
  { type: 'R2C', id: 'b6f29a8d-27ca-43a4-bcb5-dfd5c8e92b9a' },
  { type: 'R2C', id: '38490e1d-0cab-4d91-953c-9956f225b40a' },
  { type: 'R2C', id: 'eb827240-5aad-4ff7-9824-4fcb2e0db2f3' },
  { type: 'R2C', id: '09360191-090e-406b-913b-2c25ae11c4d1' },
  { type: 'R2C', id: 'd2c56ab0-f19f-4264-be70-35761acaf921' },
  { type: 'R2C', id: '5e668591-5d1b-447c-83b8-1bdde3b3818a' },
  { type: 'R2C', id: 'b6507bae-784d-41de-9260-0f5936f99918' },
  { type: 'R2C', id: 'f93e8e55-020f-4b55-a07d-dda959bff1d6' },
  { type: 'R2C', id: '0c383558-e595-452a-8179-ecf6ed679404' },
  { type: 'R2C', id: '4e8068a8-e751-432d-b3d7-fd3c700005ec' },
  { type: 'R2C', id: '29fa08c2-1985-4d2f-bd89-fa0ffc8e64ef' },
  { type: 'R2C', id: 'eca98ad7-0c90-4c61-8674-23332f38782a' },
  { type: 'R2C', id: '32776e78-94ca-4236-9d98-06a2d6c40ce3' },
  { type: 'R2C', id: '7e81de2d-1f50-41a3-8564-820e1d971da8' },
  { type: 'R2C', id: '2ec7e41e-3a7b-44c5-be35-490b3eb8d1a4' },
  { type: 'R2C', id: '1458535a-5eda-4a9b-885f-92f42abe519d' },
  { type: 'R2C', id: '0b01e9d3-9adb-4e7f-a8d9-fb26a37d79e2' },
  { type: 'R2C', id: 'e58f1d3d-a3ca-4292-8618-369217523e5c' },
  { type: 'R2C', id: '3ebf8d37-0b72-46b1-b0c5-1fbfcd229122' },
  { type: 'R2C', id: '2b070d04-4532-41a0-ae80-2e451606aba5' },
  { type: 'R2C', id: '12d5107e-dfbf-458a-a3c2-ebd88565481a' },
  { type: 'R2C', id: 'aa9dd6ae-2647-4e21-af11-dc9401391489' },
  { type: 'R2C', id: 'b5130012-835e-4373-a74f-05c8beb5bc0d' },
  { type: 'R2C', id: '60142c55-d9ae-4d08-8d6e-d69c5010f85e' },
  { type: 'R2C', id: '45d282b0-2f86-4a85-bf83-a50e214e128d' },
  { type: 'R2C', id: '5e475f9b-ca82-49bf-98ef-cc1b794444ff' },
  // Anime
  { type: 'R2A', id: 'f65a5836-622b-4d8a-8eb6-3ebd3e629974' },
  { type: 'R2A', id: '77a06d69-70fc-4fec-9970-0ffda0938e21' },
  { type: 'R2A', id: '94dfb7b2-0050-4e48-a9b7-8fdf6b3a9628' },
  { type: 'R2A', id: '6eca50ae-a125-4309-816c-d799794d8843' },
  { type: 'R2A', id: 'e7ab31ca-6cea-4db6-9b2c-af630831a078' },
  { type: 'R2A', id: 'd95f066b-dc4d-443b-99b0-ce614b8839f0' },
  { type: 'R2A', id: '7b46fac6-9872-471d-9b4f-0ee6b6c05c89' },
  { type: 'R2A', id: 'e33f2af8-6c60-4160-b72e-b81da64c8063' },
  { type: 'R2A', id: '46365b8f-c41e-4e15-8e6f-03cc452b30fe' },
  // Mature
  { type: 'R2C', id: '24daf5e0-0768-45cd-a952-da084ec80bbb' },
  { type: 'R2C', id: '250ad133-7ecb-420d-b216-1fdb6fb44ed3' },
  { type: 'R2C', id: 'fd2975be-ec58-4393-88f9-8aa55f857a97' },
  { type: 'R2C', id: '16a39999-1ecd-469a-88ee-a003f681a4de' },
  { type: 'R2C', id: 'b9ef2d5c-4dc8-4729-b93b-8dfa3f887aab' },
  { type: 'R2C', id: '3088b3fe-2ec8-4342-a8fe-f7632b42f82f' },
  { type: 'R2C', id: 'efa7dca9-5f5f-432b-87d0-769478fcab19' },
  { type: 'R2C', id: '8d625ef6-edd3-4bb9-a1ff-a309fc6d2f47' },
  { type: 'R2C', id: 'a6b4094d-0b66-4f9c-93a0-05eb5d045734' },
  { type: 'R2C', id: 'dfec0ad5-024c-4404-8d31-0c7ad302be6c' },
];

async function main() {
  console.log(`Generating videos for ${AVATARS.length} avatars (~$${(AVATARS.length * 0.25).toFixed(2)})...\n`);
  const results = [];

  for (let i = 0; i < AVATARS.length; i++) {
    const a = AVATARS[i];
    const base = a.type === 'R2A' ? R2A : R2C;
    const imageUrl = `${base}/${a.id}.jpg`;
    const prompt = a.type === 'R2A' ? PROMPT_ANIME : PROMPT_REAL;
    const num = String(i + 1).padStart(2, '0');

    console.log(`[${num}/${AVATARS.length}] ${a.id.slice(0, 8)}...`);
    try {
      const result = await generateVideo(imageUrl, prompt, { companionId: 'avatars/custom' });
      results.push({ id: a.id, type: a.type, video: result.url });
      console.log(`  → ${result.url}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ id: a.id, type: a.type, video: null, error: err.message });
    }
  }

  // Print mapping for easy copy-paste
  console.log('\n\n=== VIDEO MAPPING ===');
  for (const r of results) {
    if (r.video) {
      console.log(`${r.id} → ${r.video}`);
    }
  }
  console.log(`\nDone: ${results.filter(r => r.video).length}/${AVATARS.length} succeeded`);
}

main();
