import { useState, useRef, useCallback, useEffect } from 'react';
import { playAudio, stopAudio } from '../lib/audioManager';
import { waitForMessageAudio } from '../lib/tts';

/**
 * Hook for TTS playback on a message.
 * Returns { state, toggle } where state is 'idle' | 'loading' | 'playing' | 'paused'.
 */
export default function useTTS(messageId, initialAudioUrl = null) {
  const [state, setState] = useState('idle');
  const urlRef = useRef(initialAudioUrl);
  const activeRef = useRef(null); // tracks if THIS hook's audio is the current one

  useEffect(() => {
    if (initialAudioUrl) urlRef.current = initialAudioUrl;
  }, [initialAudioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        stopAudio();
        activeRef.current = null;
      }
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!messageId) return;

    // Playing → stop
    if (state === 'playing') {
      stopAudio();
      activeRef.current = null;
      setState('idle');
      return;
    }

    // Idle → fetch and play
    setState('loading');

    try {
      let url = urlRef.current;
      if (!url) {
        const data = await waitForMessageAudio(messageId, { timeoutMs: 20000, source: 'manual' });
        url = data.audioUrl;
        if (!url) throw new Error(data.error || 'Audio not ready');
        urlRef.current = url;
      }

      activeRef.current = playAudio(url, {
        onEnded: () => { activeRef.current = null; setState('idle'); },
        onError: () => { activeRef.current = null; setState('idle'); },
      });
      setState('playing');
    } catch (err) {
      console.error('[tts]', err);
      setState('idle');
    }
  }, [messageId, state]);

  return { state, toggle };
}
