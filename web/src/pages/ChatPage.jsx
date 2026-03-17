import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useChat from '../hooks/useChat';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import CompanionSheet from '../components/chat/CompanionSheet';
import ReportModal from '../components/chat/ReportModal';

export default function ChatPage() {
  const { companionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    messages, companion, setCompanion, loading, streaming, streamingText,
    hasMore, error, tipPromoMessage,
    mediaLoading, mediaLoadingType, showMediaButton,
    loadChat, loadMore, sendMessage, triggerNext, requestMedia, dismissTip,
  } = useChat(companionId);
  const [showSheet, setShowSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [toast, setToast] = useState(null);

  // Handle tip=success/cancel query param
  useEffect(() => {
    const tip = searchParams.get('tip');
    if (tip === 'success') setToast('Thank you for the tip!');
    if (tip === 'cancel') setToast('Tip canceled');
    if (tip) {
      searchParams.delete('tip');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const scrollToBottom = useCallback(() => {
    setScrollTrigger(n => n + 1);
  }, []);

  const handleSend = useCallback((content) => {
    sendMessage(content);
    setTimeout(scrollToBottom, 50);
  }, [sendMessage, scrollToBottom]);

  const handleTriggerNext = useCallback(() => {
    triggerNext();
    setTimeout(scrollToBottom, 50);
  }, [triggerNext, scrollToBottom]);

  const handleRequestMedia = useCallback(() => {
    requestMedia();
    setTimeout(scrollToBottom, 50);
  }, [requestMedia, scrollToBottom]);

  // Auto-scroll when new message added
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

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
    <div className="h-screen bg-brand-bg flex flex-col max-w-lg mx-auto w-full">
      <ChatHeader companion={companion} onCompanionTap={() => setShowSheet(true)} />

      {/* Toast */}
      {toast && (
        <div className="px-4 py-2 bg-brand-success/10 border-b border-brand-success/30 text-brand-success text-sm text-center">
          {toast}
          <button onClick={() => setToast(null)} className="ml-3 text-brand-success/60 hover:text-brand-success">×</button>
        </div>
      )}

      <MessageList
        messages={messages}
        streaming={streaming}
        streamingText={streamingText}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onTriggerNext={handleTriggerNext}
        showNextButton={!streaming}
        scrollTrigger={scrollTrigger}
        tipPromoMessage={tipPromoMessage}
        onDismissTip={dismissTip}
        companionId={companionId}
        mediaLoading={mediaLoading}
        mediaLoadingType={mediaLoadingType}
        showMediaButton={showMediaButton}
        onRequestMedia={handleRequestMedia}
        companionAvatarUrl={companion?.avatar_url}
      />

      {/* Error banner */}
      {error && error !== 'subscription_required' && (
        <div className="px-4 py-2 bg-brand-error/10 border-t border-brand-error/20 text-center">
          <span className="text-sm text-brand-error">{error}</span>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        disabled={streaming}
      />

      {showSheet && (
        <CompanionSheet
          companion={companion}
          onClose={() => setShowSheet(false)}
          onReport={() => { setShowSheet(false); setShowReport(true); }}
          onUpdate={(updated) => setCompanion(updated)}
        />
      )}

      {showReport && (
        <ReportModal
          companionId={companionId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
