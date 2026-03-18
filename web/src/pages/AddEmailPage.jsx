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
  const nativePlatform = isCapacitor();
  const safeAreaBottom = nativePlatform
    ? 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
    : '0.75rem';

  const handleSubmit = async () => {
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
      navigate('/my/profile');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-brand-bg flex flex-col w-full overflow-hidden"
      style={{ height: isCapacitor() ? 'calc(var(--app-viewport-height, 100vh) - env(safe-area-inset-top, 0px))' : '100vh' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border flex-shrink-0">
        <button
          onClick={() => navigate('/my/profile')}
          aria-label="Back"
          className="text-brand-muted hover:text-brand-text transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-brand-text">Add Email</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <p className="text-sm text-brand-text-secondary text-center leading-relaxed">
          Your Apple account uses a private relay email.<br />
          Add your real email to receive messages from your girlfriends and account recovery.
        </p>
        {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}
      </div>

      {/* Input bar */}
      <div
        className="flex items-end gap-2 px-4 py-3 border-t border-brand-border flex-shrink-0"
        style={{ paddingBottom: safeAreaBottom }}
      >
        <textarea
          rows={1}
          value={email}
          onChange={e => setEmail(e.target.value.replace(/\n/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
          placeholder="your@email.com"
          autoFocus
          className="flex-1 min-w-0 px-3 py-2.5 bg-brand-surface border border-brand-border rounded-xl text-brand-text text-sm placeholder:text-brand-muted resize-none focus:outline-none focus:border-brand-accent/50"
          style={{ maxHeight: 80 }}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !email.trim()}
          className="flex-shrink-0 px-4 py-2.5 bg-brand-accent text-white text-sm font-semibold rounded-xl disabled:opacity-40"
        >
          {saving ? '...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
