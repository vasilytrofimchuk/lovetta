import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useChat from '../hooks/useChat';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';

export default function ChatPage() {
  const { companionId } = useParams();
  const navigate = useNavigate();
  const {
    messages, companion, loading, streaming, streamingText,
    hasMore, error, shouldRequestTip,
    loadChat, loadMore, sendMessage, triggerNext, dismissTip,
  } = useChat(companionId);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="text-brand-muted">Loading chat...</div>
      </div>
    );
  }

  if (error === 'subscription_required') {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <div className="text-5xl mb-4">💜</div>
          <h2 className="text-xl font-semibold text-brand-text mb-2">She's waiting for you</h2>
          <p className="text-brand-text-secondary mb-6">
            Start your free trial to talk with {companion?.name || 'her'}. 3 days free, cancel anytime.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="px-6 py-3 rounded-xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors"
          >
            View Plans
          </button>
          <button
            onClick={() => navigate('/')}
            className="block mx-auto mt-3 text-sm text-brand-muted hover:text-brand-text transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-brand-bg flex flex-col">
      <ChatHeader companion={companion} />

      <MessageList
        messages={messages}
        streaming={streaming}
        streamingText={streamingText}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      {/* Tip banner */}
      {shouldRequestTip && (
        <div className="px-4 py-2 bg-brand-accent/10 border-t border-brand-accent/20 flex items-center justify-between">
          <span className="text-sm text-brand-accent">
            Enjoying the chat? Send {companion?.name} a tip!
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/pricing')}
              className="px-3 py-1 rounded-lg bg-brand-accent text-white text-xs font-medium"
            >
              Send Tip
            </button>
            <button onClick={dismissTip} className="text-brand-accent/60 hover:text-brand-accent text-lg">×</button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && error !== 'subscription_required' && (
        <div className="px-4 py-2 bg-brand-error/10 border-t border-brand-error/20 text-center">
          <span className="text-sm text-brand-error">{error}</span>
        </div>
      )}

      <ChatInput
        onSend={sendMessage}
        onNext={triggerNext}
        disabled={streaming}
      />
    </div>
  );
}
