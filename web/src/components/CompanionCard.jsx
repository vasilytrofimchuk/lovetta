import { useNavigate } from 'react-router-dom';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'],
  ['#f06060', '#ec4899'],
  ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'],
  ['#f0a040', '#f06060'],
  ['#a040e0', '#6060f0'],
  ['#e06080', '#f0a040'],
  ['#40a0a0', '#40c080'],
  ['#c060e0', '#6080f0'],
  ['#f08060', '#f0c040'],
  ['#6080c0', '#a040e0'],
  ['#e04080', '#f06060'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % GRADIENT_COLORS.length;
  return GRADIENT_COLORS[idx];
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function CompanionCard({ companion }) {
  const navigate = useNavigate();
  const [from, to] = getGradient(companion.name);

  return (
    <button
      onClick={() => navigate(`/chat/${companion.id}`)}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left"
    >
      {/* Avatar */}
      {companion.avatar_url ? (
        <img src={companion.avatar_url} alt={companion.name}
          className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {getInitials(companion.name)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-brand-text truncate">{companion.name}</span>
          {companion.last_message_at && (
            <span className="text-xs text-brand-muted ml-2 flex-shrink-0">
              {timeAgo(companion.last_message_at)}
            </span>
          )}
        </div>
        <p className="text-sm text-brand-text-secondary truncate mt-0.5">
          {companion.last_message || companion.tagline || 'Start a conversation...'}
        </p>
      </div>
    </button>
  );
}
