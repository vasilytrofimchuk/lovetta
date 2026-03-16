import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import StreamingMessage from './StreamingMessage';

export default function MessageList({ messages, streaming, streamingText, hasMore, onLoadMore }) {
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
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {/* Load more sentinel */}
      {hasMore && <div ref={sentinelRef} className="text-center text-brand-muted text-xs py-2">Loading earlier messages...</div>}

      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Streaming indicator */}
      {streaming && <StreamingMessage text={streamingText} />}

      <div ref={bottomRef} />
    </div>
  );
}
