import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useChat from '../hooks/useChat';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import CompanionSheet from '../components/chat/CompanionSheet';
import ReportModal from '../components/chat/ReportModal';
import PlanModal from '../components/PlanModal';
import { isCapacitor } from '../lib/platform';

export default function ChatPage() {
  const { companionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    messages, companion, setCompanion, loading, streaming, streamingText,
    hasMore, error, tipPromoMessage,
    mediaLoading, mediaLoadingType, showMediaButton,
    loadChat, loadMore, sendMessage, triggerNext, requestMedia, dismissTip, clearError,
  } = useChat(companionId);
  const [showSheet, setShowSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // Handle tip=success/cancel query param — reload chat to show server-inserted thank-you message
  useEffect(() => {
    const tip = searchParams.get('tip');
    if (tip) {
      searchParams.delete('tip');
      setSearchParams(searchParams, { replace: true });
      if (tip === 'success') loadChat();
    }
  }, [searchParams, setSearchParams, loadChat]);

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


  const chatHeight = isCapacitor()
    ? 'calc(100vh - env(safe-area-inset-top, 0px))'
    : '100vh'

  return (
    <div className="bg-brand-bg flex flex-col max-w-lg mx-auto w-full" style={{ height: chatHeight }}>
      <ChatHeader companion={companion} onCompanionTap={() => setShowSheet(true)} />

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
      {error && error !== 'subscription_required' && error !== 'free_limit_reached' && (
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

      <PlanModal
        isOpen={error === 'subscription_required' || error === 'free_limit_reached'}
        onClose={clearError}
        onSuccess={clearError}
      />
    </div>
  );
}
