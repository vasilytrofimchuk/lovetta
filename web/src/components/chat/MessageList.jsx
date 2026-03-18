import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import StreamingMessage from './StreamingMessage';
import TipPromoMessage from './TipPromoMessage';

export default function MessageList({ messages, streaming, streamingText, hasMore, onLoadMore, onTriggerNext, showNextButton, scrollTrigger, tipPromoMessage, onDismissTip, companionId, mediaLoading, mediaLoadingType, showMediaButton, onRequestMedia, companionAvatarUrl }) {
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
    <div className="flex-1 min-h-0 overflow-hidden relative">
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-4">
        {/* Load more sentinel */}
        {hasMore && <div ref={sentinelRef} className="text-center text-brand-muted text-xs py-2">Loading earlier messages...</div>}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Tip promo message */}
        {tipPromoMessage && (
          <TipPromoMessage message={tipPromoMessage} companionId={companionId} onDismiss={onDismissTip} />
        )}

        {/* Streaming indicator */}
        {streaming && <StreamingMessage text={streamingText} mediaLoading={mediaLoading} mediaLoadingType={mediaLoadingType} avatarUrl={companionAvatarUrl} />}

        <div ref={bottomRef} />
      </div>

      {/* Floating "ask for photo" button — above the bolt button */}
      {showMediaButton && !streaming && (
        <button
          onClick={onRequestMedia}
          className="absolute bottom-16 right-4 p-2.5 rounded-full bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent shadow-lg transition-colors z-10"
          title="Ask for a photo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
      )}

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
