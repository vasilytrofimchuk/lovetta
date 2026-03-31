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

function formatActions(text) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const actionMatch = part.match(/^\*([^*]+)\*$/);
    if (actionMatch) {
      return <em key={i} className="text-brand-accent/70 not-italic text-[13px]">{actionMatch[1]}</em>;
    }
    return part;
  });
}

export default function StreamingMessage({ text, mediaLoading, mediaLoadingType, avatarUrl }) {
  // Parse leading scene and context
  let sceneText = null;
  let contextText = null;
  let content = text;

  const sceneMatch = content.match(/\[scene:\s*([^\]]+)\]\s*/i);
  if (sceneMatch) {
    sceneText = sceneMatch[1].trim();
    content = content.replace(sceneMatch[0], '').trim();
  }

  const match = content.match(/^\*([^*]+)\*/);
  if (match) {
    contextText = match[1].trim();
    content = content.slice(match[0].length).trim();
    contextText = truncateNatural(contextText, 8);
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%]">
        {sceneText && (
          <div className="text-[13px] italic text-brand-accent/50 mb-1 px-1">
            {sceneText}
          </div>
        )}
        {contextText && (
          <div className="text-xs italic text-brand-muted mb-1 px-1">
            *{contextText}*
          </div>
        )}

        {/* Blurred avatar placeholder while media generates */}
        {mediaLoading && (
          <div className="mb-2 relative app-chat-media aspect-[3/4] rounded-xl overflow-hidden bg-brand-surface">
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(28px) saturate(1.3) brightness(1.1)', transform: 'scale(1.15)' }}
              />
            )}
            {/* Dark overlay so text is readable */}
            <div className="absolute inset-0 bg-black/30" />
            {/* Centered spinner + text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-3 border-white/30 border-t-white/90 rounded-full animate-spin" />
              <span className="text-white text-sm font-medium drop-shadow-lg">
                {mediaLoadingType === 'video' ? 'Recording a video for you...' : 'Taking a photo for you...'}
              </span>
            </div>
          </div>
        )}

        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-brand-card border border-brand-border text-brand-text text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {content ? (
            <>
              {formatActions(content)}
              {!mediaLoading && <span className="inline-block w-0.5 h-4 bg-brand-accent ml-0.5 animate-pulse" />}
            </>
          ) : (
            <span className="inline-flex gap-1 text-brand-muted">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
