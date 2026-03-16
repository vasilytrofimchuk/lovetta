import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import StreamingMessage from './StreamingMessage';

export default function MessageList({ messages, streaming, streamingText, hasMore, onLoadMore, onTriggerNext, showNextButton, scrollTrigger }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  // Auto-scroll to bottom on new messages (only if user was already at bottom)
  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText]);

  // Scroll to bottom when scrollTrigger changes
  useEffect(() => {
    if (scrollTrigger) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollTrigger]);

  // Track if user is at bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Infinite scroll up — load more when sentinel is visible
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoadMore?.(); },
      { root: containerRef.current, threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div className="flex-1 overflow-hidden relative">
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-4">
        {/* Load more sentinel */}
        {hasMore && <div ref={sentinelRef} className="text-center text-brand-muted text-xs py-2">Loading earlier messages...</div>}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {streaming && <StreamingMessage text={streamingText} />}

        <div ref={bottomRef} />
      </div>

      {/* Floating "let her message" button — sticky over scroll area */}
      {showNextButton && !streaming && (
        <button
          onClick={onTriggerNext}
          className="absolute bottom-4 right-4 p-2.5 rounded-full bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent shadow-lg transition-colors z-10"
          title="Let her message you"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>
      )}
    </div>
  );
}
