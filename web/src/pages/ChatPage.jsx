import { useEffect, useState, useCallback, useRef } from 'react';
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
import api from '../lib/api';
import { playAudio as globalPlayAudio, stopAudio as globalStopAudio, setOnStopCallback } from '../lib/audioManager';
import { waitForMessageAudio } from '../lib/tts';

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
    lastAssistantMessageId, setLastAssistantMessageId,
    loadChat, loadMore, sendMessage, triggerNext, requestMedia, dismissTip, clearError,
  } = useChat(companionId);
  const [showSheet, setShowSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showPlanFromLimit, setShowPlanFromLimit] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [tipSent, setTipSent] = useState(null); // { amount }

  // Auto-audio: state + ref
  const [autoAudio, setAutoAudio] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const autoAudioRef = useRef(false);
  const playedAutoIdsRef = useRef(new Set());
  useEffect(() => {
    api.get('/api/user/preferences').then(({ data }) => {
      const val = !!data.auto_audio;
      autoAudioRef.current = val;
      setAutoAudio(val);
    }).catch(() => {});
  }, []);

  // Track audio playing state via global manager
  useEffect(() => {
    setOnStopCallback(() => setAudioPlaying(false));
    return () => setOnStopCallback(null);
  }, []);

  const toggleAutoAudio = useCallback(() => {
    setAutoAudio(prev => {
      const newVal = !prev;
      autoAudioRef.current = newVal;
      if (!newVal) globalStopAudio();
      api.put('/api/user/preferences', { auto_audio: newVal }).catch(() => {
        autoAudioRef.current = prev;
        setAutoAudio(prev);
      });
      return newVal;
    });
  }, []);

  // Stop all audio when leaving chat or switching companions
  useEffect(() => {
    return () => globalStopAudio();
  }, [companionId]);

  useEffect(() => {
    playedAutoIdsRef.current.clear();
  }, [companionId]);

  useEffect(() => {
    if (!autoAudioRef.current || !lastAssistantMessageId) return;
    if (playedAutoIdsRef.current.has(lastAssistantMessageId)) return;

    let cancelled = false;
    playedAutoIdsRef.current.add(lastAssistantMessageId);

    const playNext = () => {
      // Find next assistant message after current that hasn't been played
      const currentIdx = messages.findIndex(m => m.id === lastAssistantMessageId);
      for (let i = currentIdx + 1; i < messages.length; i++) {
        if (messages[i].role === 'assistant' && !playedAutoIdsRef.current.has(messages[i].id)) {
          setLastAssistantMessageId(messages[i].id);
          return;
        }
      }
      setAudioPlaying(false);
    };

    (async () => {
      try {
        const data = await waitForMessageAudio(lastAssistantMessageId, {
          timeoutMs: 20000,
          source: 'auto',
        });
        const audioUrl = data?.audioUrl;

        if (!audioUrl || cancelled || !autoAudioRef.current) {
          playedAutoIdsRef.current.delete(lastAssistantMessageId);
          return;
        }

        setAudioPlaying(true);
        globalPlayAudio(audioUrl, {
          onEnded: () => { if (!cancelled) playNext(); },
          onError: () => setAudioPlaying(false),
        });
      } catch {
        playedAutoIdsRef.current.delete(lastAssistantMessageId);
        if (!cancelled) setAudioPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, lastAssistantMessageId]);

  // Stop on visibility change (app backgrounded)
  useEffect(() => {
    const handleVisibility = () => { if (document.hidden) globalStopAudio(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      globalStopAudio();
    };
  }, []);

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

  // Auto-play intro message on first visit when auto_audio is on
  useEffect(() => {
    if (loading || !messages.length || !autoAudioRef.current) return;
    // Find the first assistant message (intro) and trigger auto-play
    const firstAssistant = messages.find(m => m.role === 'assistant');
    if (firstAssistant && !playedAutoIdsRef.current.has(firstAssistant.id)) {
      setLastAssistantMessageId(firstAssistant.id);
    }
  }, [loading, messages.length]);

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
      <ChatHeader companion={companion} onCompanionTap={() => setShowSheet(true)} autoAudio={autoAudio} onToggleAutoAudio={toggleAutoAudio} />

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
        audioPlaying={audioPlaying}
        onStopAudio={globalStopAudio}
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
