import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useChat from '../hooks/useChat';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import CompanionSheet from '../components/chat/CompanionSheet';
import ReportModal from '../components/chat/ReportModal';
import PlanModal from '../components/PlanModal';
import FreeLimitPopup from '../components/FreeLimitPopup';
import { isCapacitor } from '../lib/platform';
import { getAppPageHeight } from '../lib/layout';

export default function ChatPage() {
  const { companionId } = useParams();
  const navigate = useNavigate();
  const nativePlatform = isCapacitor();
  const pageHeight = getAppPageHeight(nativePlatform);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    messages, companion, setCompanion, loading, streaming, streamingText,
    hasMore, error, tipPromoMessage,
    mediaLoading, mediaLoadingType, showMediaButton,
    loadChat, loadMore, sendMessage, triggerNext, requestMedia, dismissTip, clearError,
  } = useChat(companionId);
  const [showSheet, setShowSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showPlanFromLimit, setShowPlanFromLimit] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [tipSent, setTipSent] = useState(null); // { amount }

  const scrollToBottom = useCallback(() => {
    setScrollTrigger(n => n + 1);
  }, []);

  const handleTipSuccess = useCallback((result) => {
    if (result?.amount) setTipSent({ amount: result.amount });
    loadChat();
    setTimeout(scrollToBottom, 100);
  }, [loadChat, scrollToBottom]);

  // Handle tip=success/cancel query param — reload chat to show server-inserted thank-you message
  useEffect(() => {
    const tip = searchParams.get('tip');
    if (tip) {
      const tipAmount = parseFloat(searchParams.get('tip_amount'));
      searchParams.delete('tip');
      searchParams.delete('tip_amount');
      setSearchParams(searchParams, { replace: true });
      if (tip === 'success') {
        if (tipAmount > 0) setTipSent({ amount: tipAmount });
        loadChat();
      }
    }
  }, [searchParams, setSearchParams, loadChat]);

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
      <div className="bg-brand-bg flex items-center justify-center" style={{ height: pageHeight }}>
        <div className="text-brand-muted">Loading chat...</div>
      </div>
    );
  }


  return (
    <div
      data-testid="chat-page"
      className="bg-brand-bg flex flex-col w-full overflow-hidden"
      style={{ height: pageHeight }}
    >
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
        onTipSuccess={handleTipSuccess}
        companionId={companionId}
        tipSent={tipSent}
        companionName={companion?.name}
        mediaLoading={mediaLoading}
        mediaLoadingType={mediaLoadingType}
        showMediaButton={showMediaButton}
        onRequestMedia={handleRequestMedia}
        companionAvatarUrl={companion?.avatar_url}
      />

      {/* Error banner */}
      {error && error !== 'subscription_required' && error !== 'free_limit_reached' && (
        <div className="app-page-gutter py-2 bg-brand-error/10 border-t border-brand-error/20 text-center">
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
          onDelete={() => navigate('/')}
          onTipSuccess={handleTipSuccess}
        />
      )}

      {showReport && (
        <ReportModal
          companionId={companionId}
          onClose={() => setShowReport(false)}
        />
      )}

      <FreeLimitPopup
        isOpen={(error === 'free_limit_reached' || error === 'subscription_required') && !showPlanFromLimit}
        onUpgrade={() => setShowPlanFromLimit(true)}
        onClose={() => { setShowPlanFromLimit(false); clearError(); }}
      />

      <PlanModal
        isOpen={showPlanFromLimit}
        onClose={() => { setShowPlanFromLimit(false); clearError(); }}
        onSuccess={() => { setShowPlanFromLimit(false); clearError(); }}
      />
    </div>
  );
}
