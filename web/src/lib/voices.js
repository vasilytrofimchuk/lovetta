const R2 = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev';

export const VOICES = [
  { id: 'b089032e45db460fb1934ece75a8c51d', label: 'Ember', desc: 'Calm & sultry' },
  { id: '7e9a17104fd644bb86b91a240b4f2055', label: 'Aurora', desc: 'Captivating & versatile' },
  { id: '58c1e4127a924d678a1a9d49e3751669', label: 'Flame', desc: 'Engaging & sassy' },
  { id: '8126dcf7ccd949a2b4d83c328efb91a5', label: 'Velour', desc: 'Poetic & romantic' },
  { id: '3c274731ecfb45e99f2dd5f65b32b518', label: 'Spark', desc: 'Quirky & enthusiastic' },
  { id: '83c19893c4974594839bd2d101b1fd66', label: 'Crystal', desc: 'Clear & engaging' },
  { id: 'db841cac47164082b26fcfe54c27748d', label: 'Silk', desc: 'Velvety & expressive' },
  { id: 'b1e436a2375f4cdfbefc432381e385f4', label: 'Pearl', desc: 'Bright & polished' },
  { id: '42f70c38fa054b65a6baecd4f817d696', label: 'Fizz', desc: 'Energetic & bubbly' },
  { id: '13ea42e651954876a59109ba40c8cdb2', label: 'Breeze', desc: 'Vibrant & light' },
  { id: '42e70f5bc7b34a9e84abbbd6ec5572d0', label: 'Dazzle', desc: 'Spirited & daring' },
  { id: '8ef4a238714b45718ce04243307c57a7', label: 'Honey', desc: 'Fun & feminine' },
  { id: '37ab9e84be5b42a18681adb35ab988d1', label: 'Moon', desc: 'Soft & soothing' },
  { id: 'd60c136243984ec78a3be125b2f38faf', label: 'Mist', desc: 'Whispery & intimate' },
  { id: 'df5c6c19dca944918dcbd6f1368fd02f', label: 'Fairy', desc: 'Magical & bright' },
  { id: '584afa907518428fac9b04c92ec8a563', label: 'Willow', desc: 'Warm & storytelling' },
  { id: '08b50a4cac844cea91a4b396bd1d10c3', label: 'Blossom', desc: 'Cute & cheerful' },
  { id: '22550e2d849b44e18c7df57f61e666f9', label: 'Echo', desc: 'Clear & emotive' },
];

export function voicePreviewUrl(voiceId) {
  return `${R2}/audio/voice-preview-${voiceId}.mp3`;
}
