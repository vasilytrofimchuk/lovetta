import { useState, useCallback, useRef } from 'react';
import api from '../lib/api';

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

  async function processSSE(url, body) {
    setStreaming(true);
    setStreamingText('');
    setShouldRequestTip(false);
    setError(null);

    const token = localStorage.getItem('lovetta-token');
    const controller = new AbortController();
    abortRef.current = controller;

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
              // Server is thinking — streaming indicator already shows
            } else if (event.type === 'chunk') {
              accumulated += event.text;
              // Typewriter effect: reveal text word-by-word
              const words = accumulated.split(/(\s+)/); // split keeping whitespace
              let wi = 0;
              if (typewriterRef.current) clearInterval(typewriterRef.current);
              setStreamingText('');
              typewriterRef.current = setInterval(() => {
                wi += 2; // 2 tokens (word + space) per tick
                if (wi >= words.length) {
                  setStreamingText(accumulated);
                  clearInterval(typewriterRef.current);
                  typewriterRef.current = null;
                } else {
                  setStreamingText(words.slice(0, wi).join(''));
                }
              }, 20);
            } else if (event.type === 'regenerate') {
              accumulated = '';
              if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
              setStreamingText('');
            } else if (event.type === 'done') {
              if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
              // Parse context from accumulated text
              const contextMatch = accumulated.match(/^\*([^*]+)\*/);
              const contextText = contextMatch ? contextMatch[1].trim() : (event.contextText || null);
              const content = contextMatch ? accumulated.slice(contextMatch[0].length).trim() : accumulated;

              const newMsg = {
                id: event.messageId,
                role: 'assistant',
                content,
                context_text: contextText,
                created_at: new Date().toISOString(),
              };
              setMessages(prev => [...prev, newMsg]);
              setStreamingText('');

              if (event.shouldRequestTip) {
                setShouldRequestTip(true);
              }
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
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || streaming) return;

    // Optimistic add user message
    const userMsg = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: content.trim(),
      context_text: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    await processSSE(`/api/chat/${companionId}/message`, { content: content.trim() });
  }, [companionId, streaming]);

  const triggerNext = useCallback(async () => {
    if (streaming) return;
    await processSSE(`/api/chat/${companionId}/next`, {});
  }, [companionId, streaming]);

  const dismissTip = useCallback(() => setShouldRequestTip(false), []);

  return {
    messages, companion, conversation, loading, streaming, streamingText,
    hasMore, error, shouldRequestTip,
    loadChat, loadMore, sendMessage, triggerNext, dismissTip,
  };
}
