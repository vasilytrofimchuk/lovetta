import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RealEmailPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('relay_email_prompt_dismissed') === '1'
  );

  if (dismissed || !user) return null;
  if (user.email_type !== 'relay' && user.email_type !== 'synthetic') return null;
  if (user.real_email) return null;

  const handleDismiss = () => {
    localStorage.setItem('relay_email_prompt_dismissed', '1');
    setDismissed(true);
  };

  const openAddEmail = () => navigate('/add-email');

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
      <div className="flex items-end gap-2" onClick={openAddEmail}>
        <div className="flex-1 min-w-0 px-3 py-2.5 bg-brand-surface border border-brand-border rounded-xl text-brand-muted text-sm cursor-pointer">
          your@email.com
        </div>
        <button
          type="button"
          className="px-4 py-2.5 bg-brand-accent text-white text-sm font-medium rounded-xl hover:bg-brand-accent-hover flex-shrink-0"
        >
          Save
        </button>
      </div>
    </div>
  );
}
