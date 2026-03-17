import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
  ['#e06080', '#f0a040'], ['#40a0a0', '#40c080'], ['#c060e0', '#6080f0'],
  ['#f08060', '#f0c040'], ['#6080c0', '#a040e0'], ['#e04080', '#f06060'],
];

const R2C = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/custom';
const R2A = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/avatars/anime';
const R2V = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev/videos/avatars/custom';
const CUSTOM_AVATARS = [
  // Realistic — batch 1 (first 5 have videos)
  { url: `${R2C}/03ebd213-a7b8-457b-ab70-bf8dcfd7db7f.jpg`, video: `${R2V}/fdb330b9-f26d-4b40-a7af-87f2c89d7651.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/ddb5c3c0-7df1-43ca-bd06-6a7c4c9c35a3.jpg`, video: `${R2V}/99763c1e-dd6b-4725-8cf4-b551b15494de.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/d7ede44e-5676-4672-868b-3704ca0399dd.jpg`, video: `${R2V}/b7cd29bc-55e9-4962-87af-c4b31184b20b.mp4`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/a4d9024a-129b-4406-bed2-e00564612d4f.jpg`, video: `${R2V}/97624c9a-5954-449e-afb9-ef59b5d6e74e.mp4`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  { url: `${R2C}/4d45d803-b90a-4bd4-a311-3028ffce54d0.jpg`, video: `${R2V}/47185f23-6169-4d3f-a79c-b034751618e0.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/91de6f92-5d82-4b1f-b99f-1f4ed51bdc6d.jpg`, video: `${R2V}/38c496ef-dabe-4dcf-9421-ba3de1876c5a.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/d0159b29-ba4e-47cf-abbc-8d213854c915.jpg`, video: `${R2V}/9e268ce0-ed37-4802-aecd-60999cfeb439.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/238e014a-fcb2-4ce7-8eee-7b67cb18e587.jpg`, video: `${R2V}/8daaa2eb-e522-4d58-818b-acd10a1c914b.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/05f74a7f-db7c-4151-aed0-c96dd90aca19.jpg`, video: `${R2V}/e63b6225-e068-4d03-b432-69cdd785cafb.mp4`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/0de421d8-a44c-4148-9d20-d930ce08ae94.jpg`, video: `${R2V}/cdc02bab-95fe-4611-a5b8-d2dcb090b1aa.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/e2d0327f-c888-48d4-b73e-83b531dc3cd6.jpg`, video: `${R2V}/83177df4-7ea9-4e7f-a711-40d56fe52210.mp4`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/94b792fb-265f-4832-b374-411d2cbcc326.jpg`, video: `${R2V}/a53670d1-6aa5-4f10-9c54-212109d8944f.mp4`, hair: 'brunette', skin: 'dark', style: 'real', age: '30-39' },
  { url: `${R2C}/d635aa3f-38b5-4fa0-bfca-f14be668a252.jpg`, video: `${R2V}/5e74dbc6-9824-4c42-9b15-c9423c3c9a7c.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/5580f18d-0ead-403f-9e35-4e02ab3f04d6.jpg`, video: `${R2V}/a273f0fe-d853-4441-86e0-f7681f3c824e.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/7df9390d-4dd0-47b6-8303-34caa28612a7.jpg`, video: `${R2V}/8b00498b-a010-4799-a09e-6d24c899e9a0.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/ebe3416f-71c4-4b88-9e22-85ad32dca153.jpg`, video: `${R2V}/7849cf3f-d3df-4776-aea6-3cd5b133c7fa.mp4`, hair: 'black', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/c80ac2b1-135c-4e51-9ddb-c01f9d170bfd.jpg`, video: `${R2V}/5f5695b7-e839-443c-85cf-93f5ddd23506.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/42e57b22-83a0-46d9-a968-a3a472d8e9a3.jpg`, video: `${R2V}/81bc1fe2-52e1-42b6-870d-91df8e6db512.mp4`, hair: 'black', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/79d337a2-85c6-4c3e-a73b-0dc0d46a20a5.jpg`, video: `${R2V}/96022b91-e7e8-40c8-bca1-33af6d8ebf99.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/bd068b08-3ce1-4065-a502-6a3132c91926.jpg`, video: `${R2V}/54cae040-8194-4f69-9a97-34f5ff705515.mp4`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 blonde
  { url: `${R2C}/3b9b72ea-aae7-46d0-b896-f286019f8d21.jpg`, video: `${R2V}/e1161154-21d4-4d4a-913b-3967e3719a16.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/f4121b7c-7231-4ac8-8559-d076e8c30a91.jpg`, video: `${R2V}/bc82c806-aa56-47ee-9d97-50224485fdb2.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/05411fae-297f-4a22-8574-a96f59563fbf.jpg`, video: `${R2V}/4f38ff09-ecbe-43b3-b044-1cbe8ce7e61a.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/b151fb54-edc1-43fb-9694-a87e425410a0.jpg`, video: `${R2V}/0d75bd99-3f55-46b3-8b1e-e1882728c82b.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/aa1520b2-b727-432d-b6ad-749c3eb61a7d.jpg`, video: `${R2V}/e79e0240-9895-4563-b624-60e9fd33b3c5.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 brunette
  { url: `${R2C}/55a0c623-5552-46b9-af3c-47782c6bd0c4.jpg`, video: `${R2V}/ccd5a799-41ba-4518-8b9c-78bff7fabf1e.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/ab17ffa5-be42-4c9f-8f50-2a3be0c3664b.jpg`, video: `${R2V}/4a65b3e2-392d-49a4-a600-d077627b4450.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/a4b12f77-3d2c-4363-ac32-1d56e46e6a12.jpg`, video: `${R2V}/44bd49c9-956f-4516-96f8-e19d1fe294b8.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/cb8991af-4a6b-4e76-b89c-bdac8d4d9287.jpg`, video: `${R2V}/7c194607-caa0-4be8-abf2-4ae480ba02e2.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/c8be6ef7-009f-48fe-87c2-0a99e96c14f1.jpg`, video: `${R2V}/f678671e-7b57-4257-bd8f-ab7a23b5ed6e.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 2 black
  { url: `${R2C}/33bdc7e6-d0e2-4f4a-b415-eab3ae5d734b.jpg`, video: `${R2V}/3902250a-0109-447d-8cdd-6be9e9c4d44f.mp4`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/6666fce3-8632-4031-9278-8b22fe76fea7.jpg`, video: `${R2V}/1951a471-21ec-4d63-9308-c560a200af75.mp4`, hair: 'black', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/df44b709-61c6-4e48-a466-5afc439ce08d.jpg`, video: `${R2V}/ea6d43a6-14ee-4ca4-ae92-9c588ca1e89d.mp4`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  { url: `${R2C}/cacb021b-0727-4db8-b6d5-18589ce1e447.jpg`, video: `${R2V}/1432ff7f-36b5-445e-8af7-b63c3a631a55.mp4`, hair: 'black', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/a3e87986-9d4e-4e37-bc79-ecd39913d902.jpg`, video: `${R2V}/1d5e4df9-19c7-4ccf-8610-be76d3c5723a.mp4`, hair: 'black', skin: 'medium', style: 'real', age: '23-29' },
  // Realistic — batch 2 red
  { url: `${R2C}/14b04dd1-2e0c-4b4e-9cb3-2c189b8ff9be.jpg`, video: `${R2V}/e72f82ec-feae-4110-af14-a3ee2e1d8b26.mp4`, hair: 'red', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/e3835dc6-2116-4d91-9178-4f79a18a4378.jpg`, video: `${R2V}/68dea2e5-277e-4e8c-bacb-ab54c554dc9d.mp4`, hair: 'red', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/8cc825e4-843b-4de7-b0ab-4f2acffcc006.jpg`, video: `${R2V}/312eb526-ba98-4939-8310-037f03dea41d.mp4`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/b6f29a8d-27ca-43a4-bcb5-dfd5c8e92b9a.jpg`, video: `${R2V}/a315d8ca-87e4-4b17-a4b4-cd61a024fdee.mp4`, hair: 'red', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/38490e1d-0cab-4d91-953c-9956f225b40a.jpg`, video: `${R2V}/454f9837-ade4-45c6-8f43-ae1f0fc7b8e6.mp4`, hair: 'red', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 2 other
  { url: `${R2C}/eb827240-5aad-4ff7-9824-4fcb2e0db2f3.jpg`, video: `${R2V}/99963dc1-cb18-44c8-9239-8765e7a5b8c1.mp4`, hair: 'other', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/09360191-090e-406b-913b-2c25ae11c4d1.jpg`, video: `${R2V}/c371b793-08b2-4569-9179-c68ec855c816.mp4`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/d2c56ab0-f19f-4264-be70-35761acaf921.jpg`, video: `${R2V}/22a49e9b-1791-4ca6-8774-6fca8ab293aa.mp4`, hair: 'other', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/5e668591-5d1b-447c-83b8-1bdde3b3818a.jpg`, video: `${R2V}/100c35c5-9dac-471f-9f79-c8f59d619391.mp4`, hair: 'other', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/b6507bae-784d-41de-9260-0f5936f99918.jpg`, video: `${R2V}/7d4fd3c6-fc18-43dc-bd1d-924b15641967.mp4`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 diverse
  { url: `${R2C}/f93e8e55-020f-4b55-a07d-dda959bff1d6.jpg`, video: `${R2V}/8b4553d5-2a65-4c9e-9765-dc7469b317a1.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/0c383558-e595-452a-8179-ecf6ed679404.jpg`, video: `${R2V}/bee799af-2b24-43e2-b445-e6b829080f7e.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/4e8068a8-e751-432d-b3d7-fd3c700005ec.jpg`, video: `${R2V}/a66f6f43-827b-4ff0-b5e9-1825eb766bee.mp4`, hair: 'black', skin: 'asian', style: 'real', age: '23-29' },
  { url: `${R2C}/29fa08c2-1985-4d2f-bd89-fa0ffc8e64ef.jpg`, video: `${R2V}/9fe6ea35-bc9e-43a9-980c-1e20d08a00e2.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/eca98ad7-0c90-4c61-8674-23332f38782a.jpg`, video: `${R2V}/814ec5c2-25eb-4d5b-9b0c-7730c5017442.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 3
  { url: `${R2C}/32776e78-94ca-4236-9d98-06a2d6c40ce3.jpg`, video: `${R2V}/9374c779-3334-4c8a-b82f-22e61664e2a0.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/7e81de2d-1f50-41a3-8564-820e1d971da8.jpg`, video: `${R2V}/249926f6-738a-42d6-99d4-96f8fc3b9e5c.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/2ec7e41e-3a7b-44c5-be35-490b3eb8d1a4.jpg`, video: `${R2V}/937b7dec-5a95-4c65-bef1-79d8790bf4c0.mp4`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/1458535a-5eda-4a9b-885f-92f42abe519d.jpg`, video: `${R2V}/2fe4331c-6f2a-40b2-ad38-0fc99a714b1e.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/0b01e9d3-9adb-4e7f-a8d9-fb26a37d79e2.jpg`, video: `${R2V}/afc293a6-63f2-4ebc-92c5-62b9381d52d5.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/e58f1d3d-a3ca-4292-8618-369217523e5c.jpg`, video: `${R2V}/baec5533-bebc-4399-83f5-3cc647fc6622.mp4`, hair: 'black', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/3ebf8d37-0b72-46b1-b0c5-1fbfcd229122.jpg`, video: `${R2V}/ec05f817-803f-4f1b-a859-9e151cd41985.mp4`, hair: 'black', skin: 'dark', style: 'real', age: '23-29' },
  { url: `${R2C}/2b070d04-4532-41a0-ae80-2e451606aba5.jpg`, video: `${R2V}/a3f8e5f2-b538-494e-bd8d-070ad6aa11a9.mp4`, hair: 'black', skin: 'dark', style: 'real', age: '18-22' },
  { url: `${R2C}/12d5107e-dfbf-458a-a3c2-ebd88565481a.jpg`, video: `${R2V}/51459b90-c172-45d0-ac40-6c9cd5bdfe33.mp4`, hair: 'black', skin: 'dark', style: 'real', age: '30-39' },
  // Realistic — batch 4
  { url: `${R2C}/aa9dd6ae-2647-4e21-af11-dc9401391489.jpg`, video: `${R2V}/6be4d9fc-726b-4d75-82ed-3fc9e4106512.mp4`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/b5130012-835e-4373-a74f-05c8beb5bc0d.jpg`, video: `${R2V}/29a968f3-fd65-41f5-8c0a-d06b3eca377f.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/60142c55-d9ae-4d08-8d6e-d69c5010f85e.jpg`, video: `${R2V}/984ca99e-4b8e-42a5-b395-0e6f3f2ebb19.mp4`, hair: 'black', skin: 'dark', style: 'real', age: '30-39' },
  { url: `${R2C}/45d282b0-2f86-4a85-bf83-a50e214e128d.jpg`, video: `${R2V}/cd23868d-b451-44ac-8f61-4fe93e73522a.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/5e475f9b-ca82-49bf-98ef-cc1b794444ff.jpg`, video: `${R2V}/d5e5c621-d571-4cf7-9c62-ced5652d5c16.mp4`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  // Anime
  { url: `${R2A}/f65a5836-622b-4d8a-8eb6-3ebd3e629974.jpg`, video: `${R2V}/ca9cbd4b-89a0-4577-a2ff-d6cfb8847ce6.mp4`, hair: 'brunette', skin: 'light', style: 'anime', age: '23-29' },
  { url: `${R2A}/77a06d69-70fc-4fec-9970-0ffda0938e21.jpg`, video: `${R2V}/add5134c-5a56-4190-bb38-ce488be3d7c7.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  { url: `${R2A}/94dfb7b2-0050-4e48-a9b7-8fdf6b3a9628.jpg`, video: `${R2V}/cb4c6104-e36c-4bb0-9b2a-d4beb95ca7d0.mp4`, hair: 'red', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/6eca50ae-a125-4309-816c-d799794d8843.jpg`, video: `${R2V}/05e57cf5-77d0-4303-a0de-40aa7dd83fe0.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/ef4cca5e-8003-4ceb-9da5-bea5a787ca1f.jpg`, video: `${R2V}/d811b854-6c57-49ca-bde3-888b06a53094.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/d95f066b-dc4d-443b-99b0-ce614b8839f0.jpg`, video: `${R2V}/29d521d6-76b2-4857-ad6d-c002a25eb5a7.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/7b46fac6-9872-471d-9b4f-0ee6b6c05c89.jpg`, video: `${R2V}/b4eeb108-cd6c-4a25-adfd-b89d9c520ca0.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  { url: `${R2A}/e33f2af8-6c60-4160-b72e-b81da64c8063.jpg`, video: `${R2V}/c36b870f-b21f-477b-86d2-9b2ab14b84a2.mp4`, hair: 'red', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/46365b8f-c41e-4e15-8e6f-03cc452b30fe.jpg`, video: `${R2V}/ca2e2e1a-fafd-466f-876c-ac4ff24e3881.mp4`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  // Realistic — mature (40-50)
  { url: `${R2C}/24daf5e0-0768-45cd-a952-da084ec80bbb.jpg`, video: `${R2V}/62b93390-50d2-4f42-b6a0-f5c1144db2af.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/250ad133-7ecb-420d-b216-1fdb6fb44ed3.jpg`, video: `${R2V}/f6eb3e9d-1a1c-4f9f-8516-c309b35d54d8.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/fd2975be-ec58-4393-88f9-8aa55f857a97.jpg`, video: `${R2V}/9ba79a25-ac5d-4a29-8938-5922e956ca40.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/16a39999-1ecd-469a-88ee-a003f681a4de.jpg`, video: `${R2V}/9bea6dc5-c4c5-45be-b54d-14dd9d61fef9.mp4`, hair: 'other', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/b9ef2d5c-4dc8-4729-b93b-8dfa3f887aab.jpg`, video: `${R2V}/648ee217-f1f8-4fa3-9038-3d0db16fa180.mp4`, hair: 'red', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/3088b3fe-2ec8-4342-a8fe-f7632b42f82f.jpg`, video: `${R2V}/a1b3f832-2488-41d7-b987-bc6439b0449e.mp4`, hair: 'black', skin: 'asian', style: 'real', age: '40-50' },
  { url: `${R2C}/efa7dca9-5f5f-432b-87d0-769478fcab19.jpg`, video: `${R2V}/40352fa6-5d52-492b-92d9-837803a1ec13.mp4`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/8d625ef6-edd3-4bb9-a1ff-a309fc6d2f47.jpg`, video: `${R2V}/06dc275b-5225-4df2-a411-fdc4c58edbef.mp4`, hair: 'black', skin: 'dark', style: 'real', age: '40-50' },
  { url: `${R2C}/a6b4094d-0b66-4f9c-93a0-05eb5d045734.jpg`, video: `${R2V}/965beb1f-861a-4c35-8198-94b39865db3e.mp4`, hair: 'blonde', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/dfec0ad5-024c-4404-8d31-0c7ad302be6c.jpg`, video: `${R2V}/5a4cb371-f75d-4932-b415-0ec72f304b36.mp4`, hair: 'brunette', skin: 'medium', style: 'real', age: '40-50' },
];

const STYLE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'real', label: 'Realistic' },
  { key: 'anime', label: 'Anime' },
];

const HAIR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'blonde', label: 'Blonde' },
  { key: 'brunette', label: 'Brunette' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'other', label: 'Other' },
];

const SKIN_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'dark', label: 'Dark' },
  { key: 'asian', label: 'Asian' },
];

const AGE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '18-22', label: '18-22' },
  { key: '23-29', label: '23-29' },
  { key: '30-39', label: '30-39' },
  { key: '40-50', label: '40-50' },
];

const VOICES = [
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Sunshine', desc: 'Playful & warm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Velvet', desc: 'Confident & reassuring' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Spark', desc: 'Quirky & enthusiastic' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Crystal', desc: 'Clear & engaging' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Silk', desc: 'Velvety & expressive' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Pearl', desc: 'Bright & polished' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Storm', desc: 'Confident & commanding' },
  { id: 'KF337ZXYjoHdNuYUrufC', label: 'Ember', desc: 'Calm & sultry' },
  { id: 'AyCt0WmAXUcPJR11zeeP', label: 'Breeze', desc: 'Vibrant & light' },
  { id: 'lhgliD0TncfFOY1Nc93M', label: 'Dusk', desc: 'Effortless & modern' },
  { id: 'rBUHN6YO9PJUwGXk13Jt', label: 'Aurora', desc: 'Captivating & versatile' },
  { id: 'jpICOesdLlRSc39O1UB5', label: 'Honey', desc: 'Fun & feminine' },
  { id: '6tHWtWy43FFxMeA73K4c', label: 'Moon', desc: 'Soft & soothing' },
  { id: 's50zV0dPjgaPRdN9zm48', label: 'Coral', desc: 'Natural & conversational' },
  { id: 'z12gfZvqqjJ9oHFbB5i6', label: 'Fairy', desc: 'Magical & bright' },
  { id: 'ytfkKJNB1AXxIr8dKm5H', label: 'Willow', desc: 'Warm & storytelling' },
  { id: 'OHY6EjdeHKeQymoihwfz', label: 'Blossom', desc: 'Cute & cheerful' },
  { id: 'nPpkc230TdYdntJKFNby', label: 'Echo', desc: 'Clear & emotive' },
];

const INITIAL_AVATAR_COUNT = 13;

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

function TemplateCard({ t, onSelect }) {
  const videoRef = useRef(null);
  const cardRef = useRef(null);
  const [centered, setCentered] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = centered || hovered;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !t.video_url) return;

    // Shrink the intersection zone to a narrow band in the center — only 1 row (2 cards) activates
    const observer = new IntersectionObserver(
      ([entry]) => setCentered(entry.isIntersecting),
      { rootMargin: '-40% 0px -40% 0px', threshold: 0.5 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [t.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  return (
    <button ref={cardRef} onClick={() => onSelect(t)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl overflow-hidden aspect-[3/4] group">
      {t.avatar_url && (
        <img src={t.avatar_url} alt={t.name}
          className="absolute inset-0 w-full h-full object-cover" />
      )}
      {t.video_url && active && (
        <video ref={videoRef} src={t.video_url} muted loop playsInline autoPlay
          className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!t.avatar_url && !t.video_url && (
        <div className="absolute inset-0 bg-brand-card" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 text-xs font-bold group-hover:bg-brand-accent/60 transition-colors">i</div>
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-white font-bold text-lg leading-tight">{t.name}</span>
          <span className="text-brand-accent font-semibold text-base">{t.age}</span>
        </div>
        <p className="text-white/70 text-xs mt-0.5 line-clamp-2 leading-snug">{t.tagline}</p>
      </div>
    </button>
  );
}

export default function CompanionCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState('choose'); // choose, templates, custom, confirm
  const [templates, setTemplates] = useState([]);
  const [templateFilter, setTemplateFilter] = useState('all'); // all, realistic, anime
  const [selected, setSelected] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customAvatar, setCustomAvatar] = useState(null); // null = initials, { url, video? }
  const [previewAvatar, setPreviewAvatar] = useState(null); // avatar object for video popup
  const [customTraits, setCustomTraits] = useState([]);
  const [newTrait, setNewTrait] = useState('');
  const [customVoice, setCustomVoice] = useState('cgSgspJ2msm6clMCkdW9');
  const [styleFilter, setStyleFilter] = useState('all');
  const [hairFilter, setHairFilter] = useState('all');
  const [skinFilter, setSkinFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  const [imagining, setImagining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [confirmTrait, setConfirmTrait] = useState('');

  useEffect(() => {
    api.get('/api/companions/templates').then(({ data }) => {
      const arr = data.templates || [];
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      setTemplates(arr);
    }).catch(() => {});
  }, []);

  function selectSurprise() {
    if (!templates.length) return;
    const random = templates[Math.floor(Math.random() * templates.length)];
    setSelected({ ...random, isTemplate: true });
    setStep('confirm');
  }

  function selectTemplate(t) {
    setSelected({ ...t, isTemplate: true });
    setStep('confirm');
  }

  async function imaginePersonality() {
    if (imagining) return;
    setImagining(true);
    try {
      const filters = { style: styleFilter, hair: hairFilter, skin: skinFilter, age: ageFilter };
      const { data } = await api.post('/api/companions/imagine-personality', {
        text: customPersonality.trim() || null,
        filters,
      });
      if (data.personality) setCustomPersonality(data.personality);
    } catch {}
    setImagining(false);
  }

  function submitCustom() {
    if (!customName.trim() || !customPersonality.trim()) return;
    const avatarObj = customAvatar ? CUSTOM_AVATARS.find(a => a.url === customAvatar) : null;
    setSelected({
      name: customName.trim(),
      personality: customPersonality.trim(),
      avatar_url: customAvatar,
      video_url: avatarObj?.video || null,
      tagline: '',
      traits: customTraits,
      communication_style: 'playful',
      age: 22,
      voice_id: customVoice,
      isTemplate: false,
    });
    setStep('confirm');
  }

  async function createCompanion() {
    if (creating) return;
    setCreating(true);
    setError(null);

    try {
      const body = selected.isTemplate
        ? { templateId: selected.id, name: selected.name, personality: selected.personality, traits: selected.traits, voiceId: selected.voice_id }
        : { name: selected.name, personality: selected.personality, avatarUrl: selected.avatar_url, videoUrl: selected.video_url, traits: selected.traits, voiceId: selected.voice_id };

      const { data } = await api.post('/api/companions', body);
      navigate(`/chat/${data.companion.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create companion');
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => {
            if (step === 'choose') navigate('/');
            else if (step === 'confirm' && selected?.isTemplate) setStep('templates');
            else if (step === 'confirm') setStep('custom');
            else setStep('choose');
          }}
            className="text-brand-muted hover:text-brand-text transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-brand-text">
            {step === 'choose' && 'Bring Her to Life'}
            {step === 'templates' && 'Choose a Soul'}
            {step === 'custom' && 'Be the Creator'}
            {step === 'confirm' && 'Ready to Awaken'}
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Step: Choose path */}
        {step === 'choose' && (
          <div className="space-y-3">
            <button onClick={selectSurprise}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">💫</div>
              <div className="font-semibold text-brand-text">Surprise Me</div>
              <div className="text-sm text-brand-text-secondary mt-1">Let fate decide who comes to life</div>
            </button>
            <button onClick={() => setStep('templates')}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">💜</div>
              <div className="font-semibold text-brand-text">Choose a Soul</div>
              <div className="text-sm text-brand-text-secondary mt-1">{templates.length} unique souls waiting to be awakened</div>
            </button>
            <button onClick={() => setStep('custom')}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">✨</div>
              <div className="font-semibold text-brand-text">Be the Creator</div>
              <div className="text-sm text-brand-text-secondary mt-1">Design her look, name, and personality yourself</div>
            </button>
          </div>
        )}

        {/* Step: Template grid — photo cards like dating app */}
        {step === 'templates' && (
          <>
            {/* Style filter tabs */}
            <div className="flex gap-2 mb-4">
              {[{ key: 'all', label: 'All' }, { key: 'realistic', label: 'Realistic' }, { key: 'anime', label: 'Anime' }].map(f => (
                <button key={f.key} onClick={() => setTemplateFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${templateFilter === f.key ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-text-secondary hover:text-brand-text'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {templates.filter(t => templateFilter === 'all' || (templateFilter === 'anime' ? t.style === 'anime' : t.style !== 'anime')).map(t => (
                <TemplateCard key={t.id} t={t} onSelect={selectTemplate} />
              ))}
            </div>
            <button onClick={() => setStep('custom')}
              className="w-full mt-4 p-4 rounded-xl border border-dashed border-brand-accent/40 text-brand-accent hover:bg-brand-accent/10 transition-colors flex items-center justify-center gap-2">
              <span className="text-xl leading-none">✨</span>
              <span className="font-semibold">Be the Creator</span>
            </button>
          </>
        )}

        {/* Step: Custom form */}
        {step === 'custom' && (
          <div className="space-y-5">
            {/* Avatar selection */}
            <div>
              <label className="block text-sm text-brand-text-secondary mb-2">Choose her look</label>
              {/* Filters */}
              {[
                { filters: STYLE_FILTERS, value: styleFilter, set: setStyleFilter, label: 'Style' },
                { filters: HAIR_FILTERS, value: hairFilter, set: setHairFilter, label: 'Hair' },
                { filters: SKIN_FILTERS, value: skinFilter, set: setSkinFilter, label: 'Skin' },
                { filters: AGE_FILTERS, value: ageFilter, set: setAgeFilter, label: 'Age' },
              ].map(row => (
                <div key={row.label} className="flex gap-1.5 mb-1.5 flex-wrap items-center">
                  <span className="text-xs text-brand-muted py-1 w-8">{row.label}</span>
                  {row.filters.map(c => (
                    <button key={c.key} type="button" onClick={() => row.set(c.key)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.value === c.key ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-text-secondary hover:bg-brand-accent/20'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="h-1" />
              {(() => {
                const filtered = CUSTOM_AVATARS.filter(a =>
                  (styleFilter === 'all' || a.style === styleFilter) &&
                  (hairFilter === 'all' || a.hair === hairFilter) &&
                  (skinFilter === 'all' || a.skin === skinFilter) &&
                  (ageFilter === 'all' || a.age === ageFilter)
                );
                const visible = showAllAvatars ? filtered : filtered.slice(0, INITIAL_AVATAR_COUNT);
                const hasMore = filtered.length > INITIAL_AVATAR_COUNT && !showAllAvatars;
                return (
                  <div className="grid grid-cols-5 gap-2">
                    {/* Empty avatar — initials */}
                    <button type="button" onClick={() => setCustomAvatar(null)}
                      className={`relative w-full aspect-square rounded-full border-2 transition-colors flex items-center justify-center overflow-hidden ${customAvatar === null ? 'border-brand-accent' : 'border-brand-border hover:border-brand-accent/40'}`}>
                      {customName.trim() ? (() => {
                        const [from, to] = getGradient(customName);
                        return (
                          <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold text-lg"
                            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                            {customName.trim()[0].toUpperCase()}
                          </div>
                        );
                      })() : (
                        <div className="w-full h-full rounded-full bg-brand-card" />
                      )}
                    </button>
                    {visible.map(a => (
                      <button key={a.url} type="button" onClick={() => {
                        setCustomAvatar(a.url);
                        if (a.video) setPreviewAvatar(a);
                      }}
                        className={`relative w-full aspect-square rounded-full overflow-hidden border-2 transition-colors ${customAvatar === a.url ? 'border-brand-accent' : 'border-brand-border hover:border-brand-accent/40'}`}>
                        <img src={a.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {a.video && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21" /></svg>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                    {hasMore && (
                      <button type="button" onClick={() => setShowAllAvatars(true)}
                        className="w-full aspect-square rounded-full border-2 border-dashed border-brand-accent/40 flex items-center justify-center text-brand-accent hover:bg-brand-accent/10 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Name</label>
              <input
                type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                placeholder="Give her a name..."
                className="w-full p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent"
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Personality</label>
              <div className="relative">
                <textarea
                  value={customPersonality} onChange={e => setCustomPersonality(e.target.value)}
                  placeholder={"e.g. She's a witty barista who loves late-night conversations about movies and music. Flirty but thoughtful, she remembers every detail about you and always knows how to make you smile."}
                  rows={5}
                  className="w-full p-3 pb-10 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none"
                  maxLength={2000}
                />
                <button type="button" onClick={imaginePersonality} disabled={imagining}
                  className="absolute right-2 bottom-2 px-3 py-1 rounded-full bg-brand-accent/15 text-brand-accent text-xs font-medium hover:bg-brand-accent/25 disabled:opacity-50 transition-colors">
                  {imagining ? '...' : customPersonality.trim() ? 'Improve' : 'Imagine'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Traits</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customTraits.map(t => (
                  <button key={t} type="button" onClick={() => setCustomTraits(customTraits.filter(x => x !== t))}
                    className="text-xs px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 hover:bg-brand-accent/20 transition-colors flex items-center gap-1">
                    {t} <span className="text-brand-accent/60">x</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={newTrait}
                  onChange={e => setNewTrait(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = newTrait.trim().toLowerCase();
                      if (t && !customTraits.includes(t) && customTraits.length < 10) {
                        setCustomTraits([...customTraits, t]);
                        setNewTrait('');
                      }
                    }
                  }}
                  placeholder="e.g. playful, witty, caring..."
                  className="flex-1 p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted text-sm focus:outline-none focus:border-brand-accent"
                  maxLength={30}
                />
                <button type="button" onClick={() => {
                  const t = newTrait.trim().toLowerCase();
                  if (t && !customTraits.includes(t) && customTraits.length < 10) {
                    setCustomTraits([...customTraits, t]);
                    setNewTrait('');
                  }
                }} disabled={!newTrait.trim()}
                  className="px-4 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary hover:bg-brand-border disabled:opacity-30 transition-colors">
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Voice</label>
              <div className="grid grid-cols-3 gap-2">
                {VOICES.map(v => (
                  <button key={v.id} type="button" onClick={() => setCustomVoice(v.id)}
                    className={`p-2 rounded-lg border text-left transition-colors ${customVoice === v.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-surface hover:border-brand-accent/40'}`}>
                    <div className={`text-sm font-medium ${customVoice === v.id ? 'text-brand-accent' : 'text-brand-text'}`}>{v.label}</div>
                    <div className="text-xs text-brand-muted">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={submitCustom}
              disabled={!customName.trim() || !customPersonality.trim()}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-40 hover:bg-brand-accent-hover transition-colors">
              Continue
            </button>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && selected && (
          <div className="space-y-4">
            {/* Hero photo card */}
            {selected.avatar_url || selected.video_url ? (
              <div className="relative rounded-2xl overflow-hidden aspect-[3/4]">
                {selected.video_url ? (
                  <video src={selected.video_url} autoPlay muted loop playsInline
                    preload="auto"
                    className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <img src={selected.avatar_url} alt={selected.name}
                    className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white font-bold text-2xl">{selected.name}</span>
                    <span className="text-brand-accent font-semibold text-xl">{selected.age}</span>
                  </div>
                  {selected.tagline && (
                    <p className="text-white/70 text-sm mt-1">{selected.tagline}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                {(() => {
                  const [from, to] = getGradient(selected.name);
                  return (
                    <div className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-white font-bold text-3xl"
                      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                      {selected.name[0]}
                    </div>
                  );
                })()}
                <h2 className="text-xl font-bold text-brand-text">{selected.name}</h2>
                {selected.tagline && (
                  <p className="text-brand-text-secondary mt-1">{selected.tagline}</p>
                )}
              </div>
            )}

            {/* Name */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Name</div>
              <input type="text" value={selected.name}
                onChange={e => setSelected({ ...selected, name: e.target.value })}
                className="w-full bg-transparent text-brand-text font-semibold text-lg focus:outline-none border-b border-transparent focus:border-brand-accent transition-colors"
                maxLength={30} />
            </div>

            {/* Personality */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Personality</div>
              <textarea value={selected.personality}
                onChange={e => setSelected({ ...selected, personality: e.target.value })}
                rows={4}
                className="w-full bg-transparent text-sm text-brand-text-secondary focus:outline-none focus:text-brand-text resize-none border-b border-transparent focus:border-brand-accent transition-colors"
                maxLength={2000} />
            </div>

            {/* Traits */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Traits</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(Array.isArray(selected.traits) ? selected.traits : []).map((t, i) => (
                  <button key={i} type="button"
                    onClick={() => setSelected({ ...selected, traits: selected.traits.filter((_, j) => j !== i) })}
                    className="px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-medium hover:bg-brand-accent/20 transition-colors flex items-center gap-1">
                    {t} <span className="text-brand-accent/50">x</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={confirmTrait}
                  onChange={e => setConfirmTrait(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = confirmTrait.trim().toLowerCase();
                      const traits = Array.isArray(selected.traits) ? selected.traits : [];
                      if (t && !traits.includes(t) && traits.length < 10) {
                        setSelected({ ...selected, traits: [...traits, t] });
                        setConfirmTrait('');
                      }
                    }
                  }}
                  placeholder="Add trait..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-brand-surface border border-brand-border text-brand-text text-xs focus:outline-none focus:border-brand-accent"
                  maxLength={30} />
                <button type="button" onClick={() => {
                  const t = confirmTrait.trim().toLowerCase();
                  const traits = Array.isArray(selected.traits) ? selected.traits : [];
                  if (t && !traits.includes(t) && traits.length < 10) {
                    setSelected({ ...selected, traits: [...traits, t] });
                    setConfirmTrait('');
                  }
                }} disabled={!confirmTrait.trim()}
                  className="px-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary text-xs hover:bg-brand-border disabled:opacity-30 transition-colors">
                  +
                </button>
              </div>
            </div>

            {/* Voice */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-2">Voice</div>
              <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                {VOICES.map(v => (
                  <button key={v.id} type="button"
                    onClick={() => setSelected({ ...selected, voice_id: v.id })}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-colors ${(selected.voice_id || '') === v.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-surface hover:border-brand-accent/40'}`}>
                    <div className={`text-xs font-medium ${(selected.voice_id || '') === v.id ? 'text-brand-accent' : 'text-brand-text'}`}>{v.label}</div>
                    <div className="text-[10px] text-brand-muted leading-tight">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm text-center">
                {error}
              </div>
            )}

            <button onClick={createCompanion} disabled={creating || !selected.name.trim()}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-40 hover:bg-brand-accent-hover transition-colors">
              {creating ? 'Bringing her to life...' : `Awaken ${selected.name.trim() || '...'}`}
            </button>
          </div>
        )}
      </div>

      {/* Video preview popup — plays once then auto-closes */}
      {previewAvatar && previewAvatar.video && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreviewAvatar(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden" onClick={() => setPreviewAvatar(null)}>
            <video src={previewAvatar.video} autoPlay muted playsInline
              onEnded={() => setPreviewAvatar(null)}
              className="w-full aspect-[3/4] object-cover" />
          </div>
        </div>
      )}
    </div>
  );
}
