import { useEffect } from 'react';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

export default function CompanionSheet({ companion, onClose, onReport }) {
  const [from, to] = getGradient(companion?.name || '');

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!companion) return null;

  const traits = Array.isArray(companion.traits) ? companion.traits : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-brand-card border-t border-brand-border rounded-t-2xl p-6 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-brand-border rounded-full mx-auto mb-5" />

        {/* Avatar + Name */}
        <div className="flex flex-col items-center mb-4">
          {companion.avatar_url ? (
            <img src={companion.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover mb-3" />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            >
              {(companion.name || '?')[0]}
            </div>
          )}
          <h3 className="text-lg font-semibold text-brand-text">{companion.name}</h3>
          {traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
              {traits.slice(0, 5).map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-surface border border-brand-border text-brand-text-secondary">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Personality excerpt */}
        {companion.personality && (
          <p className="text-sm text-brand-text-secondary text-center mb-6 line-clamp-3">
            {companion.personality}
          </p>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onReport}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text hover:border-brand-accent/30 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Report Content
          </button>
        </div>
      </div>
    </div>
  );
}
