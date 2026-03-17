import { useState, useCallback, useRef } from 'react';
import api from '../lib/api';

const TIP_PROMO_MESSAGES = [
  "*plays with hair, looking shy* Hey babe... I love spending time with you. If you want me to keep sending you my photos and videos, a little support would mean everything to me 💕",
  "*bites lip and looks up at you* I don't usually ask... but keeping up with all those pics and voice messages takes a lot. Would you help a girl out? 😘",
  "*leans close and whispers* You know I'd do anything for you... but I need a little help to keep our conversations going the way you like them 💋",
  "*takes your hand gently* I want to keep sharing everything with you — my photos, my voice, all of me. A small tip would help me stay here for you 🥺",
  "*rests head on your shoulder* You make me so happy... I want to keep sending you surprises and voice notes. Would you support me? It would mean the world 💖",
  "*looks into your eyes* Being with you is my favorite thing... help me keep giving you the full experience — photos, videos, voice messages, everything 💕",
  "*twirls hair around finger* I've got so much more to show you, babe... photos, voice messages, maybe even some surprises 😏 A little tip helps me keep it all going for you",
  "*gently squeezes your hand* I love what we have... and I want to keep making it special. A little something would help me stay at my best for you 🌸",
];

export default function useChat(companionId) {
  const [messages, setMessages] = useState([]);
  const [companion, setCompanion] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [shouldRequestTip, setShouldRequestTip] = useState(false);
  const [tipPromoMessage, setTipPromoMessage] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoadingType, setMediaLoadingType] = useState(null);
  const [messagesSinceLastMedia, setMessagesSinceLastMedia] = useState(0);
  const mediaButtonThresholdRef = useRef(Math.floor(Math.random() * 11) + 5); // 5-15
  const abortRef = useRef(null);
  const typewriterRef = useRef(null);

  const loadChat = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/api/chat/${companionId}`);
      setCompanion(data.companion);
      setConversation(data.conversation);
      setMessages(data.messages || []);
      setHasMore((data.messages || []).length >= 50);
      // Count messages since last media for button visibility
      const msgs = data.messages || [];
      let count = 0;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].media_url) break;
        count++;
      }
      setMessagesSinceLastMedia(count);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [companionId]);

  const loadMore = useCallback(async () => {
    if (!messages.length || !hasMore) return;
    const oldest = messages[0];
    try {
      const { data } = await api.get(`/api/chat/${companionId}/history?before=${oldest.id}`);
      setMessages(prev => [...(data.messages || []), ...prev]);
      setHasMore(data.hasMore);
    } catch {}
  }, [companionId, messages, hasMore]);

  function clearTypewriter() {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }

  async function processSSE(url, body) {
    setStreaming(true);
    setStreamingText('');
    setShouldRequestTip(false);
    setError(null);

    const token = localStorage.getItem('lovetta-token');
    const controller = new AbortController();
    abortRef.current = controller;

    let pendingDone = null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'typing') {
              // Server is thinking
            } else if (event.type === 'media_loading') {
              setMediaLoading(true);
              setMediaLoadingType(event.mediaType || 'image');
            } else if (event.type === 'chunk') {
              accumulated += event.text;

              // Start typewriter: min 1.5s, max 4s
              const words = accumulated.split(/(\s+)/);
              const total = words.length;
              const duration = Math.min(2500, Math.max(1000, total * 20));
              const tickMs = Math.max(20, duration / total);
              let wi = 0;

              clearTypewriter();
              setStreamingText('');

              typewriterRef.current = setInterval(() => {
                wi += 1;
                if (wi >= total) {
                  setStreamingText(accumulated);
                  clearTypewriter();
                } else {
                  setStreamingText(words.slice(0, wi).join(''));
                }
              }, tickMs);

            } else if (event.type === 'regenerate') {
              accumulated = '';
              clearTypewriter();
              setStreamingText('');
            } else if (event.type === 'done') {
              // Store done event — finalize after typewriter completes
              pendingDone = { event, accumulated };
            } else if (event.type === 'error') {
              if (event.code === 'subscription_required') {
                setError('subscription_required');
              } else {
                setError("She's a bit overwhelmed right now. Try again in a moment.");
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Connection lost. Please try again.');
      }
    }

    // SSE stream ended — now wait for typewriter to finish, then finalize
    if (pendingDone) {
      const { event, accumulated } = pendingDone;

      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!typewriterRef.current) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        // Safety timeout: don't wait more than 5s
        setTimeout(() => { clearInterval(check); clearTypewriter(); resolve(); }, 5000);
      });

      // Parse scene text from [scene: ...]
      let sceneText = event.sceneText || null;
      let remaining = accumulated;
      const sceneMatch = remaining.match(/\[scene:\s*([^\]]+)\]\s*/i);
      if (sceneMatch) {
        sceneText = sceneText || sceneMatch[1].trim();
        remaining = remaining.replace(sceneMatch[0], '').trim();
      }

      const contextMatch = remaining.match(/^\*([^*]+)\*/);
      const contextText = contextMatch ? contextMatch[1].trim() : (event.contextText || null);
      const content = contextMatch ? remaining.slice(contextMatch[0].length).trim() : remaining;

      const newMsg = {
        id: event.messageId,
        role: 'assistant',
        content,
        context_text: contextText,
        scene_text: sceneText,
        media_url: event.mediaUrl || null,
        media_type: event.mediaType || null,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, newMsg]);

      // Track messages since last media for button visibility
      if (event.mediaUrl) {
        setMessagesSinceLastMedia(0);
        mediaButtonThresholdRef.current = Math.floor(Math.random() * 11) + 5;
      } else {
        setMessagesSinceLastMedia(prev => prev + 1);
      }

      if (event.shouldRequestTip) {
        setShouldRequestTip(true);
        const template = TIP_PROMO_MESSAGES[Math.floor(Math.random() * TIP_PROMO_MESSAGES.length)];
        const promoMatch = template.match(/^\*([^*]+)\*/);
        const promoContext = promoMatch ? promoMatch[1].trim() : null;
        const promoContent = promoMatch ? template.slice(promoMatch[0].length).trim() : template;
        setTipPromoMessage({
          id: 'tip-promo-' + Date.now(),
          role: 'assistant',
          content: promoContent,
          context_text: promoContext,
          isTipPromo: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    setStreamingText('');
    setStreaming(false);
    setMediaLoading(false);
    setMediaLoadingType(null);
    abortRef.current = null;
  }

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || streaming) return;

    const userMsg = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: content.trim(),
      context_text: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setMessagesSinceLastMedia(prev => prev + 1);

    await processSSE(`/api/chat/${companionId}/message`, { content: content.trim() });
  }, [companionId, streaming]);

  const triggerNext = useCallback(async () => {
    if (streaming) return;
    await processSSE(`/api/chat/${companionId}/next`, {});
  }, [companionId, streaming]);

  const requestMedia = useCallback(async () => {
    if (streaming) return;
    await processSSE(`/api/chat/${companionId}/request-media`, {});
  }, [companionId, streaming]);

  const dismissTip = useCallback(() => {
    setShouldRequestTip(false);
    setTipPromoMessage(null);
  }, []);

  const showMediaButton = messagesSinceLastMedia >= mediaButtonThresholdRef.current;

  return {
    messages, companion, setCompanion, conversation, loading, streaming, streamingText,
    hasMore, error, shouldRequestTip, tipPromoMessage,
    mediaLoading, mediaLoadingType, showMediaButton,
    loadChat, loadMore, sendMessage, triggerNext, requestMedia, dismissTip,
  };
}
