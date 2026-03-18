import { useState, useRef, useCallback } from 'react';
import { authFetch, getResponseErrorMessage } from '../../lib/api';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const safeAreaBottom = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
    ? 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
    : '0.75rem';

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const toggleMic = useCallback(async () => {
    if (listening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        if (blob.size < 100) return;

        try {
          const resp = await authFetch('/api/chat/stt', {
            method: 'POST',
            headers: {
              'Content-Type': mediaRecorder.mimeType,
            },
            body: blob,
          });

          if (!resp.ok) {
            const message = await getResponseErrorMessage(resp, 'Could not transcribe audio');
            console.error('[stt]', message);
            return;
          }

          if (resp.ok) {
            const data = await resp.json();
            const transcript = (data.text || '').trim();
            if (transcript) {
              onSend(transcript);
            }
          }
        } catch (err) {
          console.error('[stt]', err);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setListening(true);

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
      }, 30000);
    } catch (err) {
      console.error('[mic]', err);
    }
  }, [listening]);

  const hasMic = typeof navigator !== 'undefined' && navigator.mediaDevices;

  return (
    <div
      className="border-t border-brand-border bg-brand-bg px-4 pt-3 shrink-0"
      style={{ paddingBottom: safeAreaBottom }}
    >
      <div className="max-w-md mx-auto flex items-end gap-2">
        {/* Mic button — left side, small */}
        {hasMic && !disabled && (
          <button
            onClick={toggleMic}
            className={`flex-shrink-0 p-2 rounded-full transition-colors ${
              listening
                ? 'bg-red-500 text-white animate-pulse'
                : 'text-brand-muted hover:text-brand-accent'
            }`}
            title={listening ? 'Stop recording' : 'Voice input'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening...' : 'Type a message...'}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none py-2.5 px-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent text-base leading-relaxed disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />

        {/* Send button — always visible */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 p-2.5 rounded-full bg-brand-accent text-white disabled:opacity-30 hover:bg-brand-accent-hover transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
