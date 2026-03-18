import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../lib/api';

export default function SupportChat({ onClose }) {
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  const loadChat = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get('/api/support/chat');
      setChat(data.chat);
      setMessages(data.messages);
    } catch (err) {
      console.error('[support] loadChat error:', err);
      setError('Could not connect to support. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const pollMessages = useCallback(async () => {
    if (!chat) return;
    try {
      const lastId = messages.length ? messages[messages.length - 1].id : 0;
      const { data } = await api.get(`/api/support/chat/${chat.id}/messages?after=${lastId}`);
      if (data.messages.length) {
        setMessages(prev => [...prev, ...data.messages]);
      }
    } catch { /* ignore poll errors */ }
  }, [chat, messages]);

  useEffect(() => {
    loadChat();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadChat]);

  useEffect(() => {
    if (!chat) return;
    pollRef.current = setInterval(pollMessages, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [chat, pollMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || !chat || sending) return;
    setInput('');
    setSending(true);
    try {
      const { data } = await api.post(`/api/support/chat/${chat.id}/messages`, { content: msg });
      setMessages(prev => [...prev, data.message]);
    } catch (err) {
      console.error('[support] send error:', err);
      setInput(msg); // restore on failure
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full sm:max-w-md mx-auto bg-brand-card border border-brand-border rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{ height: '70vh', maxHeight: 600 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border flex-shrink-0">
          <div>
            <p className="font-semibold text-brand-text">Support</p>
            <p className="text-xs text-brand-muted">
              {loading ? 'Connecting...' : error ? 'Connection failed' : 'We typically reply within a few hours'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && (
            <div className="text-center text-brand-muted text-sm mt-8">Connecting...</div>
          )}
          {!loading && error && (
            <div className="text-center mt-8">
              <p className="text-brand-accent text-sm mb-3">{error}</p>
              <button
                onClick={loadChat}
                className="px-4 py-2 bg-brand-accent text-white text-sm font-semibold rounded-lg hover:bg-brand-accent-hover transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="text-center text-brand-muted text-sm mt-8 leading-relaxed">
              How can we help?<br />Send us a message and we'll get back to you.
            </div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                  msg.sender_type === 'user'
                    ? 'bg-brand-accent text-white'
                    : 'bg-brand-surface border border-brand-border text-brand-text'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.sender_type === 'user' ? 'text-white/60' : 'text-brand-muted'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 px-4 py-3 border-t border-brand-border flex-shrink-0">
          <textarea
            rows={2}
            placeholder={loading ? 'Connecting...' : error ? 'Connection failed — retry above' : 'Type a message...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || !!error || !chat}
            className="flex-1 px-3 py-2 bg-brand-surface border border-brand-border rounded-xl text-brand-text text-sm placeholder:text-brand-muted resize-none focus:outline-none focus:border-brand-accent/50 disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || !chat || loading || !!error}
            className="px-4 py-2 bg-brand-accent text-white text-sm font-semibold rounded-xl hover:bg-brand-accent-hover transition-colors disabled:opacity-40 self-end"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
