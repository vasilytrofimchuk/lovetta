import { useState, useRef, useCallback } from 'react';
import { authFetch, getResponseErrorMessage } from '../../lib/api';
import { isCapacitor } from '../../lib/platform';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingModeRef = useRef(null);
  const stopTimeoutRef = useRef(null);
  const chunksRef = useRef([]);
  const nativePlatform = isCapacitor();
  const safeAreaBottom = nativePlatform
    ? 'calc(max(0.75rem, env(safe-area-inset-bottom, 0px)) + var(--app-keyboard-offset, 0px))'
    : '0.75rem';
  const canRequestMic = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const canRecordAudio = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
  const showMicButton = nativePlatform || (canRequestMic && canRecordAudio);

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    setMicError('');
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
    if (micError) setMicError('');
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function clearStopTimeout() {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }

  function base64ToBlob(base64, mimeType) {
    const cleanBase64 = base64.includes(',') ? base64.split(',').pop() : base64;
    const byteString = window.atob(cleanBase64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const uploadRecording = useCallback(async (blob, mimeType) => {
    if (!blob || blob.size < 100) return;

    try {
      const resp = await authFetch('/api/chat/stt', {
        method: 'POST',
        headers: {
          'Content-Type': mimeType || blob.type || 'audio/webm',
        },
        body: blob,
      });

      if (!resp.ok) {
        const message = await getResponseErrorMessage(resp, 'Could not transcribe audio');
        console.error('[stt]', message);
        setMicError(message);
        return;
      }

      const data = await resp.json();
      const transcript = (data.text || '').trim();
      if (transcript) {
        setMicError('');
        onSend(transcript);
      } else {
        setMicError('No speech detected. Try speaking a bit longer.');
      }
    } catch (err) {
      console.error('[stt]', err);
      setMicError('Voice transcription failed. Please try again.');
    }
  }, [onSend]);

  const stopRecording = useCallback(async () => {
    clearStopTimeout();

    try {
      if (recordingModeRef.current === 'native') {
        const { VoiceRecorder } = await import('capacitor-voice-recorder');
        const { value } = await VoiceRecorder.stopRecording();
        recordingModeRef.current = null;
        setListening(false);

        if (!value?.recordDataBase64 || value.msDuration < 250) {
          setMicError('Recording was too short. Try again.');
          return;
        }

        const blob = base64ToBlob(value.recordDataBase64, value.mimeType || 'audio/aac');
        await uploadRecording(blob, value.mimeType || 'audio/aac');
        return;
      }

      if (recordingModeRef.current === 'web' && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        recordingModeRef.current = null;
      }
    } catch (err) {
      console.error('[mic]', err);
      setMicError('Could not stop voice recording. Please try again.');
      setListening(false);
      recordingModeRef.current = null;
    }
  }, [uploadRecording]);

  const scheduleAutoStop = useCallback(() => {
    clearStopTimeout();
    stopTimeoutRef.current = setTimeout(() => {
      stopRecording().catch((error) => {
        console.error('[mic] auto-stop failed', error);
      });
    }, 30000);
  }, [stopRecording]);

  const toggleMic = useCallback(async () => {
    if (listening) {
      await stopRecording();
      return;
    }

    try {
      setMicError('');

      if (nativePlatform) {
        const { VoiceRecorder } = await import('capacitor-voice-recorder');
        const { value: canVoiceRecord } = await VoiceRecorder.canDeviceVoiceRecord();
        if (!canVoiceRecord) {
          setMicError('Voice input is unavailable on this device.');
          return;
        }

        let permission = await VoiceRecorder.hasAudioRecordingPermission().catch(() => ({ value: false }));
        if (!permission.value) {
          permission = await VoiceRecorder.requestAudioRecordingPermission();
        }

        if (!permission.value) {
          setMicError('Microphone permission denied. Enable it in iPhone Settings.');
          return;
        }

        await VoiceRecorder.startRecording();
        recordingModeRef.current = 'native';
        setListening(true);
        scheduleAutoStop();
        return;
      }

      if (!canRequestMic || !canRecordAudio) {
        console.error('[mic] Voice input is unavailable on this device');
        setMicError('Voice input is unavailable on this device.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        clearStopTimeout();
        recordingModeRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        await uploadRecording(blob, mediaRecorder.mimeType || blob.type || 'audio/webm');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      recordingModeRef.current = 'web';
      setListening(true);
      scheduleAutoStop();
    } catch (err) {
      console.error('[mic]', err);
      setMicError(nativePlatform
        ? 'Could not start voice recording. Check microphone access in iPhone Settings.'
        : 'Could not start voice recording. Please try again.');
    }
  }, [canRecordAudio, canRequestMic, listening, nativePlatform, scheduleAutoStop, stopRecording, uploadRecording]);

  return (
    <div
      className="border-t border-brand-border bg-brand-bg app-page-gutter pt-3 shrink-0"
      style={{ paddingBottom: safeAreaBottom }}
    >
      <div className="w-full">
        {micError && (
          <p className="mb-2 text-xs text-brand-accent">{micError}</p>
        )}

        <div className="flex items-end gap-2">
          {showMicButton && !disabled && (
            <button
              onClick={toggleMic}
              className={`flex-shrink-0 p-2 rounded-full transition-colors ${
                listening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-brand-muted hover:text-brand-accent'
              }`}
              aria-label={listening ? 'Stop voice input' : 'Voice input'}
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

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={listening ? 'Listening...' : 'Type a message...'}
            aria-label="Chat message input"
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none py-2.5 px-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent text-base leading-relaxed disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            aria-label="Send message"
            title="Send message"
            className="flex-shrink-0 p-2.5 rounded-full bg-brand-accent text-white disabled:opacity-30 hover:bg-brand-accent-hover transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
