export default function StreamingMessage({ text }) {
  // Parse context from *asterisks*
  let contextText = null;
  let content = text;
  const match = text.match(/^\*([^*]+)\*/);
  if (match) {
    contextText = match[1].trim();
    content = text.slice(match[0].length).trim();
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%]">
        {contextText && (
          <div className="text-xs italic text-brand-muted mb-1 px-1">
            *{contextText}*
          </div>
        )}
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-brand-card border border-brand-border text-brand-text text-[15px] leading-relaxed">
          {content || (
            <span className="inline-flex gap-1 text-brand-muted">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
            </span>
          )}
          {content && <span className="inline-block w-0.5 h-4 bg-brand-accent ml-0.5 animate-pulse" />}
        </div>
      </div>
    </div>
  );
}
