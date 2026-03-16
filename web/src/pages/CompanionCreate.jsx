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
const CUSTOM_AVATARS = [
  // Realistic — batch 1
  { url: `${R2C}/03ebd213-a7b8-457b-ab70-bf8dcfd7db7f.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/ddb5c3c0-7df1-43ca-bd06-6a7c4c9c35a3.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/d7ede44e-5676-4672-868b-3704ca0399dd.jpg`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/a4d9024a-129b-4406-bed2-e00564612d4f.jpg`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  { url: `${R2C}/4d45d803-b90a-4bd4-a311-3028ffce54d0.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/91de6f92-5d82-4b1f-b99f-1f4ed51bdc6d.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/d0159b29-ba4e-47cf-abbc-8d213854c915.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/238e014a-fcb2-4ce7-8eee-7b67cb18e587.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/05f74a7f-db7c-4151-aed0-c96dd90aca19.jpg`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/0de421d8-a44c-4148-9d20-d930ce08ae94.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/e2d0327f-c888-48d4-b73e-83b531dc3cd6.jpg`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/94b792fb-265f-4832-b374-411d2cbcc326.jpg`, hair: 'brunette', skin: 'dark', style: 'real', age: '30-39' },
  { url: `${R2C}/d635aa3f-38b5-4fa0-bfca-f14be668a252.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/5580f18d-0ead-403f-9e35-4e02ab3f04d6.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/7df9390d-4dd0-47b6-8303-34caa28612a7.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/ebe3416f-71c4-4b88-9e22-85ad32dca153.jpg`, hair: 'black', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/c80ac2b1-135c-4e51-9ddb-c01f9d170bfd.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/42e57b22-83a0-46d9-a968-a3a472d8e9a3.jpg`, hair: 'black', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/79d337a2-85c6-4c3e-a73b-0dc0d46a20a5.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/bd068b08-3ce1-4065-a502-6a3132c91926.jpg`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 blonde
  { url: `${R2C}/3b9b72ea-aae7-46d0-b896-f286019f8d21.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/f4121b7c-7231-4ac8-8559-d076e8c30a91.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/05411fae-297f-4a22-8574-a96f59563fbf.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/b151fb54-edc1-43fb-9694-a87e425410a0.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/aa1520b2-b727-432d-b6ad-749c3eb61a7d.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 brunette
  { url: `${R2C}/55a0c623-5552-46b9-af3c-47782c6bd0c4.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/ab17ffa5-be42-4c9f-8f50-2a3be0c3664b.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/a4b12f77-3d2c-4363-ac32-1d56e46e6a12.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/cb8991af-4a6b-4e76-b89c-bdac8d4d9287.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/c8be6ef7-009f-48fe-87c2-0a99e96c14f1.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 2 black
  { url: `${R2C}/33bdc7e6-d0e2-4f4a-b415-eab3ae5d734b.jpg`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/6666fce3-8632-4031-9278-8b22fe76fea7.jpg`, hair: 'black', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/df44b709-61c6-4e48-a466-5afc439ce08d.jpg`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  { url: `${R2C}/cacb021b-0727-4db8-b6d5-18589ce1e447.jpg`, hair: 'black', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/a3e87986-9d4e-4e37-bc79-ecd39913d902.jpg`, hair: 'black', skin: 'medium', style: 'real', age: '23-29' },
  // Realistic — batch 2 red
  { url: `${R2C}/14b04dd1-2e0c-4b4e-9cb3-2c189b8ff9be.jpg`, hair: 'red', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/e3835dc6-2116-4d91-9178-4f79a18a4378.jpg`, hair: 'red', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/8cc825e4-843b-4de7-b0ab-4f2acffcc006.jpg`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/b6f29a8d-27ca-43a4-bcb5-dfd5c8e92b9a.jpg`, hair: 'red', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/38490e1d-0cab-4d91-953c-9956f225b40a.jpg`, hair: 'red', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 2 other
  { url: `${R2C}/eb827240-5aad-4ff7-9824-4fcb2e0db2f3.jpg`, hair: 'other', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/09360191-090e-406b-913b-2c25ae11c4d1.jpg`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/d2c56ab0-f19f-4264-be70-35761acaf921.jpg`, hair: 'other', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/5e668591-5d1b-447c-83b8-1bdde3b3818a.jpg`, hair: 'other', skin: 'light', style: 'real', age: '30-39' },
  { url: `${R2C}/b6507bae-784d-41de-9260-0f5936f99918.jpg`, hair: 'other', skin: 'light', style: 'real', age: '23-29' },
  // Realistic — batch 2 diverse
  { url: `${R2C}/f93e8e55-020f-4b55-a07d-dda959bff1d6.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/0c383558-e595-452a-8179-ecf6ed679404.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/4e8068a8-e751-432d-b3d7-fd3c700005ec.jpg`, hair: 'black', skin: 'asian', style: 'real', age: '23-29' },
  { url: `${R2C}/29fa08c2-1985-4d2f-bd89-fa0ffc8e64ef.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/eca98ad7-0c90-4c61-8674-23332f38782a.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '30-39' },
  // Realistic — batch 3
  { url: `${R2C}/32776e78-94ca-4236-9d98-06a2d6c40ce3.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/7e81de2d-1f50-41a3-8564-820e1d971da8.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/2ec7e41e-3a7b-44c5-be35-490b3eb8d1a4.jpg`, hair: 'red', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/1458535a-5eda-4a9b-885f-92f42abe519d.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '30-39' },
  { url: `${R2C}/0b01e9d3-9adb-4e7f-a8d9-fb26a37d79e2.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/e58f1d3d-a3ca-4292-8618-369217523e5c.jpg`, hair: 'black', skin: 'medium', style: 'real', age: '18-22' },
  { url: `${R2C}/3ebf8d37-0b72-46b1-b0c5-1fbfcd229122.jpg`, hair: 'black', skin: 'dark', style: 'real', age: '23-29' },
  { url: `${R2C}/2b070d04-4532-41a0-ae80-2e451606aba5.jpg`, hair: 'black', skin: 'dark', style: 'real', age: '18-22' },
  { url: `${R2C}/12d5107e-dfbf-458a-a3c2-ebd88565481a.jpg`, hair: 'black', skin: 'dark', style: 'real', age: '30-39' },
  // Realistic — batch 4
  { url: `${R2C}/aa9dd6ae-2647-4e21-af11-dc9401391489.jpg`, hair: 'black', skin: 'light', style: 'real', age: '23-29' },
  { url: `${R2C}/b5130012-835e-4373-a74f-05c8beb5bc0d.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '18-22' },
  { url: `${R2C}/60142c55-d9ae-4d08-8d6e-d69c5010f85e.jpg`, hair: 'black', skin: 'dark', style: 'real', age: '30-39' },
  { url: `${R2C}/45d282b0-2f86-4a85-bf83-a50e214e128d.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '23-29' },
  { url: `${R2C}/5e475f9b-ca82-49bf-98ef-cc1b794444ff.jpg`, hair: 'black', skin: 'asian', style: 'real', age: '18-22' },
  // Anime — young (20-22)
  { url: `${R2A}/0830f45e-9a2c-404a-857a-93b7fb8e2f60.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '18-22' },
  { url: `${R2A}/ad94b84a-84ac-4b5b-a2e7-4e2f9e9e3a10.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '18-22' },
  { url: `${R2A}/7de9fad2-4e73-4dbe-afc0-91bddabc5f38.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '18-22' },
  // Anime — mid (23-25)
  { url: `${R2A}/f65a5836-622b-4d8a-8eb6-3ebd3e629974.jpg`, hair: 'brunette', skin: 'light', style: 'anime', age: '23-29' },
  { url: `${R2A}/77a06d69-70fc-4fec-9970-0ffda0938e21.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  // Anime — mature (26-30)
  { url: `${R2A}/94dfb7b2-0050-4e48-a9b7-8fdf6b3a9628.jpg`, hair: 'red', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/6eca50ae-a125-4309-816c-d799794d8843.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/e7ab31ca-6cea-4db6-9b2c-af630831a078.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/d95f066b-dc4d-443b-99b0-ce614b8839f0.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '30-39' },
  // Anime — mixed
  { url: `${R2A}/f3acc5f3-a839-401e-8faf-fdca12f9f93d.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '18-22' },
  { url: `${R2A}/7b46fac6-9872-471d-9b4f-0ee6b6c05c89.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  { url: `${R2A}/700b4223-43d0-4c56-b85b-110c859316f8.jpg`, hair: 'blonde', skin: 'light', style: 'anime', age: '18-22' },
  { url: `${R2A}/e33f2af8-6c60-4160-b72e-b81da64c8063.jpg`, hair: 'red', skin: 'light', style: 'anime', age: '30-39' },
  { url: `${R2A}/46365b8f-c41e-4e15-8e6f-03cc452b30fe.jpg`, hair: 'other', skin: 'light', style: 'anime', age: '23-29' },
  // Realistic — mature (40-50)
  { url: `${R2C}/24daf5e0-0768-45cd-a952-da084ec80bbb.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/250ad133-7ecb-420d-b216-1fdb6fb44ed3.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/fd2975be-ec58-4393-88f9-8aa55f857a97.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/16a39999-1ecd-469a-88ee-a003f681a4de.jpg`, hair: 'other', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/b9ef2d5c-4dc8-4729-b93b-8dfa3f887aab.jpg`, hair: 'red', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/3088b3fe-2ec8-4342-a8fe-f7632b42f82f.jpg`, hair: 'black', skin: 'asian', style: 'real', age: '40-50' },
  { url: `${R2C}/efa7dca9-5f5f-432b-87d0-769478fcab19.jpg`, hair: 'brunette', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/8d625ef6-edd3-4bb9-a1ff-a309fc6d2f47.jpg`, hair: 'black', skin: 'dark', style: 'real', age: '40-50' },
  { url: `${R2C}/a6b4094d-0b66-4f9c-93a0-05eb5d045734.jpg`, hair: 'blonde', skin: 'light', style: 'real', age: '40-50' },
  { url: `${R2C}/dfec0ad5-024c-4404-8d31-0c7ad302be6c.jpg`, hair: 'brunette', skin: 'medium', style: 'real', age: '40-50' },
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
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', desc: 'Playful & warm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', desc: 'Confident & reassuring' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura', desc: 'Quirky & enthusiastic' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice', desc: 'Clear & engaging' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily', desc: 'Velvety & expressive' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Bella', desc: 'Bright & polished' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda', desc: 'Confident & commanding' },
  { id: 'KF337ZXYjoHdNuYUrufC', label: 'Cadence', desc: 'Calm & sultry' },
  { id: 'AyCt0WmAXUcPJR11zeeP', label: 'Sasha', desc: 'Vibrant British' },
  { id: 'lhgliD0TncfFOY1Nc93M', label: 'Chloe', desc: 'Effortless & modern' },
  { id: 'rBUHN6YO9PJUwGXk13Jt', label: 'Ayana', desc: 'Captivating & versatile' },
  { id: 'jpICOesdLlRSc39O1UB5', label: 'Hallie', desc: 'Fun & feminine' },
  { id: '6tHWtWy43FFxMeA73K4c', label: 'Cynthia', desc: 'Soft & soothing' },
  { id: 's50zV0dPjgaPRdN9zm48', label: 'Gabrielle', desc: 'Natural & conversational' },
  { id: 'z12gfZvqqjJ9oHFbB5i6', label: 'Pixie', desc: 'Magical & bright' },
  { id: 'ytfkKJNB1AXxIr8dKm5H', label: 'Marta', desc: 'Warm & storytelling' },
  { id: 'OHY6EjdeHKeQymoihwfz', label: 'Riyanka', desc: 'Cute & cheerful' },
  { id: 'nPpkc230TdYdntJKFNby', label: 'Mia', desc: 'Clear & emotive' },
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
  const [active, setActive] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !t.video_url) return;

    // Shrink the intersection zone to a narrow band in the center — only 1 row (2 cards) activates
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
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
  const [selected, setSelected] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customAvatar, setCustomAvatar] = useState(null); // null = initials, string = URL
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

  useEffect(() => {
    api.get('/api/companions/templates').then(({ data }) => setTemplates(data.templates || [])).catch(() => {});
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
    setSelected({
      name: customName.trim(),
      personality: customPersonality.trim(),
      avatar_url: customAvatar,
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
        ? { templateId: selected.id, name: selected.name }
        : { name: selected.name, personality: selected.personality, avatarUrl: selected.avatar_url, traits: selected.traits, voiceId: selected.voice_id };

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
            {/* Realistic templates */}
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary mb-2">Realistic</div>
            <div className="grid grid-cols-2 gap-3">
              {templates.filter(t => t.style !== 'anime').map(t => (
                <TemplateCard key={t.id} t={t} onSelect={selectTemplate} />
              ))}
            </div>
            {/* Anime templates */}
            {templates.some(t => t.style === 'anime') && (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary mt-5 mb-2">Anime</div>
                <div className="grid grid-cols-2 gap-3">
                  {templates.filter(t => t.style === 'anime').map(t => (
                    <TemplateCard key={t.id} t={t} onSelect={selectTemplate} />
                  ))}
                </div>
              </>
            )}
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
                      <button key={a.url} type="button" onClick={() => setCustomAvatar(a.url)}
                        className={`relative w-full aspect-square rounded-full overflow-hidden border-2 transition-colors ${customAvatar === a.url ? 'border-brand-accent' : 'border-brand-border hover:border-brand-accent/40'}`}>
                        <img src={a.url} alt="" className="w-full h-full object-cover" loading="lazy" />
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

            {/* Personality preview */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Personality</div>
              <p className="text-sm text-brand-text-secondary line-clamp-4">{selected.personality}</p>
            </div>

            {/* Traits */}
            {selected.traits && selected.traits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(selected.traits) ? selected.traits : []).map((t, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm text-center">
                {error}
              </div>
            )}

            <button onClick={createCompanion} disabled={creating}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-60 hover:bg-brand-accent-hover transition-colors">
              {creating ? 'Bringing her to life...' : `Awaken ${selected.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
