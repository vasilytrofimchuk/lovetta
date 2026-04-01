import { useRef, useState } from 'react';
import useTTS from '../../hooks/useTTS';

function truncateNatural(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  for (let i = maxWords - 1; i >= Math.floor(maxWords / 2); i--) {
    if (/[,;.\-–—]$/.test(words[i])) {
      return words.slice(0, i + 1).join(' ').replace(/[,;.\-–—]+$/, '');
    }
  }
  return words.slice(0, maxWords).join(' ');
}

export function formatActions(text) {
  // Split on *action* patterns, render them as italic styled spans
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const actionMatch = part.match(/^\*([^*]+)\*$/);
    if (actionMatch) {
      const inner = actionMatch[1];
      // Multi-word = stage direction/action → green text
      // Single word = emphasis (e.g. *felt*, *own*) → italic
      if (inner.trim().includes(' ')) {
        return <em key={i} className="text-brand-accent/70 not-italic text-[13px]">{inner}</em>;
      }
      return <em key={i} className="italic">{inner}</em>;
    }
    return part;
  });
}

function ChatVideo({ src }) {
  const ref = useRef(null);
  const [ended, setEnded] = useState(false);

  const replay = () => {
    ref.current.currentTime = 0;
    ref.current.play();
    setEnded(false);
  };

  return (
    <div className="mb-2 rounded-xl overflow-hidden relative" onClick={ended ? replay : undefined}>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted
        playsInline
        onEnded={() => setEnded(true)}
        className="app-chat-media rounded-xl"
      />
      {ended && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="white" opacity="0.9">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      )}
    </div>
  );
}

function PlayButton({ messageId }) {
  const { state, toggle } = useTTS(messageId);

  // Don't show for temp messages
  if (!messageId || String(messageId).startsWith('temp-')) return null;

  return (
    <button
      onClick={toggle}
      disabled={state === 'loading'}
      className="mt-1 flex items-center gap-1 text-brand-muted hover:text-brand-accent transition-colors text-xs disabled:opacity-50"
      title={state === 'playing' ? 'Pause' : 'Play audio'}
    >
      {state === 'loading' ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      ) : state === 'playing' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  // Parse leading scene and context action
  let sceneText = message.scene_text || null;
  let contextText = message.context_text;
  let content = message.content;
  if (!contextText && !isUser) {
    // Fallback: parse [scene: ...] then *action* from content
    let remaining = content;
    if (!sceneText) {
      const sm = remaining.match(/\[scene:\s*([^\]]+)\]\s*/i);
      if (sm) { sceneText = sm[1].trim(); remaining = remaining.replace(sm[0], '').trim(); }
    }
    const match = remaining.match(/^\*([^*]+)\*/);
    if (match) {
      contextText = match[1].trim();
      remaining = remaining.slice(match[0].length).trim();
      contextText = truncateNatural(contextText, 8);
    }
    content = remaining;
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="max-w-[80%]">
        {/* Scene description (assistant only) */}
        {sceneText && !isUser && (
          <div className="text-[13px] italic text-brand-accent/50 mb-1 px-1">
            {sceneText}
          </div>
        )}

        {/* Context text (assistant only) */}
        {contextText && !isUser && (
          <div className="text-xs italic text-brand-muted mb-1 px-1">
            *{contextText}*
          </div>
        )}

        {/* Media content (assistant only) */}
        {!isUser && message.media_pending && !message.media_url && (
          <div className="mb-2 app-chat-media aspect-[16/9] rounded-xl bg-brand-surface border border-brand-border overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-border/30 to-transparent animate-shimmer" />
            <div className="absolute inset-0 flex items-center justify-center text-brand-muted text-sm">
              {message.media_type === 'video' ? 'Recording a video for you...' : 'Taking a photo for you...'}
            </div>
          </div>
        )}
        {!isUser && message.media_url && message.media_type === 'image' && (
          <div className="mb-2 rounded-xl overflow-hidden">
            <img src={message.media_url} alt="" className="app-chat-media rounded-xl" loading="lazy" />
          </div>
        )}
        {!isUser && message.media_url && message.media_type === 'video' && (
          <ChatVideo src={message.media_url} />
        )}

        {/* Message bubble */}
        <div className={`px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
          isUser
            ? 'bg-brand-accent text-white rounded-br-md'
            : 'bg-brand-card border border-brand-border text-brand-text rounded-bl-md'
        }`}>
          {isUser ? content : formatActions(content)}
        </div>

        {/* Play audio button (assistant only) */}
        {!isUser && <PlayButton messageId={message.id} />}
      </div>
    </div>
  );
}
