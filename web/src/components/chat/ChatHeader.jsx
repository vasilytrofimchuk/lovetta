import { useNavigate } from 'react-router-dom';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

export default function ChatHeader({ companion, onCompanionTap }) {
  const navigate = useNavigate();
  const [from, to] = getGradient(companion?.name || '');

  return (
    <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border px-4 py-3">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <button onClick={() => navigate('/')}
          className="text-brand-muted hover:text-brand-text transition-colors flex-shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={onCompanionTap} className="flex items-center gap-3 min-w-0">
          {companion?.avatar_url ? (
            <img src={companion.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
              {(companion?.name || '?')[0]}
            </div>
          )}
          <div className="min-w-0 text-left">
            <div className="font-semibold text-brand-text truncate">{companion?.name || 'Loading...'}</div>
            <div className="text-xs text-brand-success">online</div>
          </div>
        </button>
      </div>
    </div>
  );
}
