import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Hook for TTS playback on a message.
 * Returns { state, toggle } where state is 'idle' | 'loading' | 'playing' | 'paused'.
 */
export default function useTTS(messageId) {
  const [state, setState] = useState('idle');
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!messageId) return;

    // Playing → pause
    if (state === 'playing' && audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      return;
    }

    // Paused → resume
    if (state === 'paused' && audioRef.current) {
      audioRef.current.play();
      setState('playing');
      return;
    }

    // Idle → fetch and play
    setState('loading');

    try {
      // Reuse cached URL if available
      let url = urlRef.current;
      if (!url) {
        const token = document.cookie.match(/accessToken=([^;]+)/)?.[1] || '';
        const res = await fetch(`${API_BASE}/api/chat/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ messageId }),
        });

        if (!res.ok) {
          throw new Error('TTS failed');
        }

        const data = await res.json();
        url = data.audioUrl;
        urlRef.current = url;
      }

      // Create or reuse Audio
      if (!audioRef.current || audioRef.current.src !== url) {
        if (audioRef.current) audioRef.current.pause();
        audioRef.current = new Audio(url);
        audioRef.current.addEventListener('ended', () => setState('idle'));
        audioRef.current.addEventListener('error', () => setState('idle'));
      }

      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setState('playing');
    } catch (err) {
      console.error('[tts]', err);
      setState('idle');
    }
  }, [messageId, state]);

  return { state, toggle };
}
