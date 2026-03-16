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
      </div>
    </div>
  );
}
