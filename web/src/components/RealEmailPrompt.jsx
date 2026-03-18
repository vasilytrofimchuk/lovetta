import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RealEmailPrompt() {
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('relay_email_prompt_dismissed') === '1'
  );

  // Only show for relay/synthetic users without a real_email set
  if (dismissed || !user) return null;
  if (user.email_type !== 'relay' && user.email_type !== 'synthetic') return null;
  if (user.real_email) return null;

  const handleDismiss = () => {
    localStorage.setItem('relay_email_prompt_dismissed', '1');
    setDismissed(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      setDismissed(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-accent/30 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-brand-text">
          Add your email for notifications and account recovery
        </p>
        <button
          onClick={handleDismiss}
          className="text-brand-muted hover:text-brand-text text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >&times;</button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-brand-bg border border-brand-border text-brand-text text-sm placeholder:text-brand-muted focus:outline-none focus:border-brand-accent"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand-accent text-white text-sm font-medium rounded-lg hover:bg-brand-accent-hover disabled:opacity-50 flex-shrink-0"
        >
          {saving ? '...' : 'Save'}
        </button>
      </form>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
