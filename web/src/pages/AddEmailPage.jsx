import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api from '../lib/api';
import { isCapacitor } from '../lib/platform';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddEmailPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const safeAreaBottom = isCapacitor()
    ? 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
    : '0.75rem';

  async function handleSend(e) {
    e?.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email');
      return;
    }

    setSaving(true);
    try {
      await api.put('/api/user/real-email', { email: trimmed });
      refreshUser?.();
      toast('Email saved');
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save email');
    } finally {
      setSaving(false);
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
          <p className="font-semibold text-brand-text leading-tight">Add Email</p>
          <p className="text-xs text-brand-muted">For notifications and account recovery</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto app-page-gutter py-4 space-y-3">
        <div className="text-center text-brand-muted text-sm mt-12 leading-relaxed">
          Your Apple account uses a private relay email.<br />
          Add your real email to receive messages from your girlfriends and account recovery.
        </div>
        {error && (
          <div className="text-center">
            <p className="text-brand-accent text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="border-t border-brand-border bg-brand-bg app-page-gutter pt-3 flex-shrink-0"
        style={{ paddingBottom: safeAreaBottom }}
      >
        <div className="flex items-center gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={saving}
            className="flex-1 min-w-0 py-2.5 px-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent text-base disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={saving || !email.trim()}
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
