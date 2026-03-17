const R2 = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev';

export const VOICES = [
  { id: 'KF337ZXYjoHdNuYUrufC', label: 'Ember', desc: 'Calm & sultry' },
  { id: 'rBUHN6YO9PJUwGXk13Jt', label: 'Aurora', desc: 'Captivating & versatile' },
  { id: 'hA4zGnmTwX2NQiTRMt7o', label: 'Flame', desc: 'Engaging & sassy' },
  { id: 'iCrDUkL56s3C8sCRl7wb', label: 'Velour', desc: 'Poetic & romantic' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Spark', desc: 'Quirky & enthusiastic' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Crystal', desc: 'Clear & engaging' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Silk', desc: 'Velvety & expressive' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Pearl', desc: 'Bright & polished' },
  { id: 'xctasy8XvGp2cVO9HL9k', label: 'Fizz', desc: 'Energetic & bubbly' },
  { id: 'AyCt0WmAXUcPJR11zeeP', label: 'Breeze', desc: 'Vibrant & light' },
  { id: 'i4CzbCVWoqvD0P1QJCUL', label: 'Dazzle', desc: 'Spirited & daring' },
  { id: 'jpICOesdLlRSc39O1UB5', label: 'Honey', desc: 'Fun & feminine' },
  { id: '6tHWtWy43FFxMeA73K4c', label: 'Moon', desc: 'Soft & soothing' },
  { id: 'wNvqdMNs9MLd1PG6uWuY', label: 'Mist', desc: 'Whispery & intimate' },
  { id: 'z12gfZvqqjJ9oHFbB5i6', label: 'Fairy', desc: 'Magical & bright' },
  { id: 'ytfkKJNB1AXxIr8dKm5H', label: 'Willow', desc: 'Warm & storytelling' },
  { id: 'OHY6EjdeHKeQymoihwfz', label: 'Blossom', desc: 'Cute & cheerful' },
  { id: 'nPpkc230TdYdntJKFNby', label: 'Echo', desc: 'Clear & emotive' },
];

export function voicePreviewUrl(voiceId) {
  return `${R2}/audio/voice-preview-${voiceId}.mp3`;
}
