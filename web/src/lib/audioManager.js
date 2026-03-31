/**
 * Global audio manager — ensures only one audio plays at a time.
 * Tracks the current playing Audio object so any part of the app can stop it.
 */

let currentAudio = null;
let onStopCallback = null;

export function playAudio(url, { onEnded, onError } = {}) {
  stopAudio(); // Stop anything currently playing

  const audio = new Audio(url);
  currentAudio = audio;

  audio.addEventListener('ended', () => {
    if (currentAudio === audio) currentAudio = null;
    onEnded?.();
    onStopCallback?.();
  });
  audio.addEventListener('error', () => {
    if (currentAudio === audio) currentAudio = null;
    onError?.();
    onStopCallback?.();
  });

  audio.play().catch(() => {
    if (currentAudio === audio) currentAudio = null;
    onError?.();
    onStopCallback?.();
  });

  return audio;
}

export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
    onStopCallback?.();
    return true; // was playing
  }
  return false;
}

export function isAudioPlaying() {
  return currentAudio !== null;
}

export function setOnStopCallback(cb) {
  onStopCallback = cb;
}
