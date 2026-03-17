import { useRef, useState, useCallback, useEffect } from 'react';
import { voicePreviewUrl } from '../lib/voices';

export default function useVoicePreview() {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback((voiceId) => {
    // Toggle off if same voice clicked while playing
    if (playingId === voiceId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    // Stop previous
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(voicePreviewUrl(voiceId));
    audio.addEventListener('ended', () => setPlayingId(null));
    audio.addEventListener('error', () => setPlayingId(null));
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(voiceId);
  }, [playingId]);

  return { playingId, play };
}
