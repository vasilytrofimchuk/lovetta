import { useState, useRef, useCallback } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

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
    // Auto-grow textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const toggleMic = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      if (transcript) {
        setText(prev => prev ? prev + ' ' + transcript : transcript);
      }
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  const hasText = text.trim().length > 0;
  const showMic = SpeechRecognition && !hasText && !disabled;

  return (
    <div className="border-t border-brand-border bg-brand-bg px-4 py-3">
      <div className="max-w-md mx-auto flex items-end gap-2">
        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening...' : 'Type a message...'}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none py-2.5 px-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent text-[15px] leading-relaxed disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />

        {/* Mic button (shown when no text) */}
        {showMic ? (
          <button
            onClick={toggleMic}
            className={`flex-shrink-0 p-2.5 rounded-full transition-colors ${
              listening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent'
            }`}
            title={listening ? 'Stop recording' : 'Voice input'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        ) : (
          /* Send button (shown when text present) */
          <button
            onClick={handleSend}
            disabled={!hasText || disabled}
            className="flex-shrink-0 p-2.5 rounded-full bg-brand-accent text-white disabled:opacity-30 hover:bg-brand-accent-hover transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
