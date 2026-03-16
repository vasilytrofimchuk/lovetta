export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  // Parse context from *asterisks* if not already parsed
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
      <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-1'}`}>
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
          {content}
        </div>
      </div>
    </div>
  );
}
