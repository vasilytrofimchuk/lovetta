import { useState } from 'react';
import { isCapacitor } from '../lib/platform';
import api from '../lib/api';

const APP_STORE_URL = 'https://apps.apple.com/app/id6760726614?action=write-review';
const LS_KEY = 'lovetta-rate-dismissed';
const THRESHOLDS = [10, 100, 200];

/** Return the next threshold the user hasn't dismissed yet, or null. */
function getActiveThreshold(totalMessages) {
  const dismissed = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  for (const t of THRESHOLDS) {
    if (totalMessages >= t && t > dismissed) return t;
  }
  return null;
}

function Star({ filled, onClick }) {
  return (
    <button onClick={onClick} className="p-0.5 transition-colors">
      <svg
        width="28" height="28" viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        className={filled ? 'text-yellow-400' : 'text-brand-muted'}
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

export default function RateAppBanner({ companions, totalUserMessages }) {
  const [phase, setPhase] = useState('stars'); // stars | feedback | submitting | thankyou | hidden
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');

  const native = isCapacitor();

  // Visibility: has companions, reached a new threshold
  if (!companions || companions.length === 0) return null;
  const threshold = getActiveThreshold(totalUserMessages || 0);
  if (!threshold) return null;
  if (phase === 'hidden') return null;

  const dismiss = () => {
    localStorage.setItem(LS_KEY, String(threshold));
    setPhase('hidden');
  };

  const handleStar = async (stars) => {
    setRating(stars);
    if (native && stars >= 4) {
      // iOS high rating: open App Store review directly
      localStorage.setItem(LS_KEY, String(threshold));
      setPhase('thankyou');
      api.post('/api/user/app-feedback', { rating: stars }).catch(() => {});
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: APP_STORE_URL, presentationStyle: 'popover' });
      } catch {
        window.open(APP_STORE_URL, '_blank');
      }
      setTimeout(() => setPhase('hidden'), 2000);
    } else {
      // Web (all ratings) or iOS low rating: show feedback form
      setPhase('feedback');
    }
  };

  const handleSubmit = async () => {
    setPhase('submitting');
    try {
      await api.post('/api/user/app-feedback', { rating, feedback: feedbackText });
    } catch { /* ignore */ }
    localStorage.setItem(LS_KEY, String(threshold));
    setPhase('thankyou');
    setTimeout(() => setPhase('hidden'), 2000);
  };

  return (
    <div className="mb-4 bg-brand-card border border-brand-border rounded-xl p-4">
      {phase === 'thankyou' ? (
        <p className="text-sm text-brand-text text-center py-1">Thanks for your feedback!</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-text">Enjoying Lovetta?</p>
              <p className="text-xs text-brand-text-secondary mt-0.5">Tap a star to rate your experience</p>
            </div>
            <button
              onClick={dismiss}
              className="p-1.5 text-brand-muted hover:text-brand-text transition-colors flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} filled={s <= rating} onClick={() => handleStar(s)} />
            ))}
          </div>

          {(phase === 'feedback' || phase === 'submitting') && (
            <div className="mt-3">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What could we improve?"
                rows={3}
                maxLength={2000}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-sm text-brand-text placeholder:text-brand-muted resize-none focus:outline-none focus:border-brand-accent"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSubmit}
                  disabled={phase === 'submitting'}
                  className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50"
                >
                  {phase === 'submitting' ? '...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
