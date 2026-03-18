import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { isCapacitor } from '../lib/platform';

export default function SupportPage() {
  const navigate = useNavigate();
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);
  const inputRef = useRef(null);
  const safeAreaBottom = isCapacitor()
    ? 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
    : '0.75rem';

  const loadChat = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get('/api/support/chat');
      setChat(data.chat);
      setMessages(data.messages);
    } catch {
      setError('Could not connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChat();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadChat]);

  const pollMessages = useCallback(async () => {
    if (!chat) return;
    try {
      const lastId = messages.length ? messages[messages.length - 1].id : 0;
      const { data } = await api.get(`/api/support/chat/${chat.id}/messages?after=${lastId}`);
      if (data.messages.length) setMessages(prev => [...prev, ...data.messages]);
    } catch {}
  }, [chat, messages]);

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

  async function handleSend(e) {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || !chat || sending) return;
    setInput('');
    setSending(true);
    try {
      const { data } = await api.post(`/api/support/chat/${chat.id}/messages`, { content: msg });
      setMessages(prev => [...prev, data.message]);
    } catch {
      setInput(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="bg-brand-bg flex flex-col w-full overflow-hidden"
      style={{ height: '100vh' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 app-page-gutter py-3 border-b border-brand-border flex-shrink-0 bg-brand-bg">
        <button
          onClick={() => navigate('/profile')}
          aria-label="Back"
          title="Back"
          className="text-brand-muted hover:text-brand-text transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <p className="font-semibold text-brand-text leading-tight">Support</p>
          <p className="text-xs text-brand-muted">
            {loading ? 'Connecting...' : error ? 'Connection failed' : 'We typically reply within a few hours'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto app-page-gutter py-4 space-y-3">
        {loading && <div className="text-center text-brand-muted text-sm mt-12">Connecting...</div>}
        {!loading && error && (
          <div className="text-center mt-12">
            <p className="text-brand-accent text-sm mb-3">{error}</p>
            <button onClick={loadChat} className="px-4 py-2 bg-brand-accent text-white text-sm font-semibold rounded-lg">Retry</button>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center text-brand-muted text-sm mt-12 leading-relaxed">
            How can we help?<br />Send us a message and we'll get back to you.
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm ${
              msg.sender_type === 'user'
                ? 'bg-brand-accent text-white'
                : 'bg-brand-card border border-brand-border text-brand-text'
            }`}>
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.sender_type === 'user' ? 'text-white/60' : 'text-brand-muted'}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="border-t border-brand-border bg-brand-bg app-page-gutter pt-3 flex-shrink-0"
        style={{ paddingBottom: safeAreaBottom }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder={loading ? 'Connecting...' : error ? 'Connection failed' : 'Type a message...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading || !!error || !chat}
            className="flex-1 min-w-0 py-2.5 px-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent text-base disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || !chat || loading || !!error}
            className="flex-shrink-0 p-2.5 rounded-full bg-brand-accent text-white disabled:opacity-30 hover:bg-brand-accent-hover transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
