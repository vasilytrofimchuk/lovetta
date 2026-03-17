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

export default function StreamingMessage({ text, mediaLoading, mediaLoadingType }) {
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
        {mediaLoading && (
          <div className="mt-2 flex items-center gap-1.5 text-brand-muted text-xs px-1">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
            <span>Sending {mediaLoadingType === 'video' ? 'video' : 'photo'}...</span>
          </div>
        )}
      </div>
    </div>
  );
}
