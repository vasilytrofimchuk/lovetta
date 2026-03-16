import useTTS from '../../hooks/useTTS';

function formatActions(text) {
  // Split on *action* patterns, render them as italic styled spans
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const actionMatch = part.match(/^\*([^*]+)\*$/);
    if (actionMatch) {
      return <em key={i} className="text-brand-accent/70 not-italic text-[13px]">{actionMatch[1]}</em>;
    }
    return part;
  });
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

  // Parse leading context action from *asterisks*
  let contextText = message.context_text;
  let content = message.content;
  if (!contextText && !isUser) {
    const match = content.match(/^\*([^*]+)\*/);
    if (match) {
      contextText = match[1].trim();
      content = content.slice(match[0].length).trim();
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="max-w-[80%]">
        {/* Context text (assistant only) */}
        {contextText && !isUser && (
          <div className="text-xs italic text-brand-muted mb-1 px-1">
            *{contextText}*
          </div>
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
