import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Toast';
import api, { getErrorMessage } from '../../lib/api';
import { TIP_AMOUNTS, startTipCheckout } from '../../lib/tipCheckout';
import { VOICES } from '../../lib/voices';
import useVoicePreview from '../../hooks/useVoicePreview';

function companionEmail(name, id) {
  const slug = (name || 'girl').toLowerCase().replace(/[^a-z]/g, '') || 'girl';
  const short = (id || '').replace(/-/g, '').slice(0, 6);
  return `${slug}.${short}@lovetta.email`;
}

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

export default function CompanionSheet({ companion, onClose, onReport, onUpdate, onDelete, onTipSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const [from, to] = getGradient(companion?.name || '');
  const { playingId, play: playVoice } = useVoicePreview();
  const [tipLoading, setTipLoading] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editPersonality, setEditPersonality] = useState('');
  const [editTraits, setEditTraits] = useState([]);
  const [newTrait, setNewTrait] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); } };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, editing]);

  if (!companion) return null;

  const traits = Array.isArray(companion.traits) ? companion.traits : [];

  const handleTip = async (amount) => {
    setTipLoading(amount);
    try {
      const result = await startTipCheckout(amount, companion.id, user?.id);
      if (result?.status === 'completed') {
        onTipSuccess?.(result);
        onClose?.();
      }
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setTipLoading(null);
    }
  };

  const [editVoice, setEditVoice] = useState('');

  const startEdit = () => {
    setEditPersonality(companion.personality || '');
    setEditTraits(Array.isArray(companion.traits) ? [...companion.traits] : []);
    setEditVoice(companion.voice_id || '');
    setNewTrait('');
    setEditing(true);
  };

  const addTrait = () => {
    const t = newTrait.trim().toLowerCase();
    if (t && !editTraits.includes(t) && editTraits.length < 10) {
      setEditTraits([...editTraits, t]);
      setNewTrait('');
    }
  };

  const removeTrait = (t) => setEditTraits(editTraits.filter(x => x !== t));

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/api/companions/${companion.id}`);
      setConfirmDelete(false);
      if (onDelete) onDelete(companion.id);
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const saveEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = {};
      if (editPersonality.trim() !== (companion.personality || '')) body.personality = editPersonality.trim();
      const traitsChanged = JSON.stringify(editTraits) !== JSON.stringify(companion.traits || []);
      if (traitsChanged) body.traits = editTraits;
      if (editVoice && editVoice !== (companion.voice_id || '')) body.voiceId = editVoice;
      if (!Object.keys(body).length) { setEditing(false); setSaving(false); return; }
      const { data } = await api.patch(`/api/companions/${companion.id}`, body);
      if (onUpdate) onUpdate(data.companion);
      setEditing(false);
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div
        className="app-shell-width relative max-h-[85vh] overflow-y-auto bg-brand-card border-t border-brand-border rounded-t-2xl p-6 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-brand-border rounded-full mx-auto mb-5" />

        {/* Report button — top left */}
        <button
          onClick={onReport}
          className="absolute top-5 left-5 p-2 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-surface transition-colors"
          title="Report Content"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </button>

        {/* Delete button — next to report */}
        <button
          onClick={() => setConfirmDelete(true)}
          className="absolute top-5 left-14 p-2 rounded-lg text-brand-muted hover:text-red-400 hover:bg-brand-surface transition-colors"
          title="Delete"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {/* Close button — top right */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-surface transition-colors"
          title="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Edit button — next to close */}
        {!editing && (
          <button
            onClick={startEdit}
            className="absolute top-5 right-14 p-2 rounded-lg text-brand-muted hover:text-brand-accent hover:bg-brand-surface transition-colors"
            title="Edit"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* Avatar + Name + Age */}
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
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-semibold text-brand-text">{companion.name}</h3>
            {companion.age && (
              <span className="text-brand-accent font-semibold">{companion.age}</span>
            )}
          </div>
          <a
            href={`mailto:${companionEmail(companion.name, companion.id)}`}
            className="text-xs text-brand-muted hover:text-brand-accent transition-colors mt-1"
          >
            {companionEmail(companion.name, companion.id)}
          </a>
        </div>

        {/* Edit mode — personality + traits */}
        {editing ? (
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-xs text-brand-muted mb-1 block">Personality</label>
              <textarea
                value={editPersonality}
                onChange={(e) => setEditPersonality(e.target.value)}
                rows={4}
                placeholder="Describe her personality..."
                className="w-full p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text text-sm focus:outline-none focus:border-brand-accent resize-none"
                maxLength={2000}
              />
            </div>
            <div>
              <label className="text-xs text-brand-muted mb-1 block">Traits (tap to remove)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editTraits.map((t) => (
                  <button key={t} type="button" onClick={() => removeTrait(t)}
                    className="text-xs px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 hover:bg-brand-accent/20 transition-colors flex items-center gap-1">
                    {t} <span className="text-brand-accent/60">x</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={newTrait}
                  onChange={(e) => setNewTrait(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrait(); } }}
                  placeholder="Add trait..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-brand-surface border border-brand-border text-brand-text text-xs focus:outline-none focus:border-brand-accent"
                  maxLength={30}
                />
                <button type="button" onClick={addTrait} disabled={!newTrait.trim()}
                  className="px-3 py-1.5 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary text-xs hover:bg-brand-border disabled:opacity-30 transition-colors">
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-brand-muted mb-1 block">Voice</label>
              <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                {VOICES.map(v => (
                  <button key={v.id} type="button" onClick={() => { setEditVoice(v.id); playVoice(v.id); }}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-colors relative ${editVoice === v.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-surface hover:border-brand-accent/40'}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`absolute top-1 right-1 ${playingId === v.id ? 'text-brand-accent animate-pulse' : 'text-brand-muted'}`}>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      {playingId === v.id && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
                    </svg>
                    <div className={`text-xs font-medium ${editVoice === v.id ? 'text-brand-accent' : 'text-brand-text'}`}>{v.label}</div>
                    <div className="text-[10px] text-brand-muted leading-tight">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-brand-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-brand-accent-hover transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg bg-brand-surface text-brand-text-secondary text-sm hover:bg-brand-border transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Traits (view) */}
            {traits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
                {traits.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-surface border border-brand-border text-brand-text-secondary">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Personality + Voice (view) */}
            <div className="mb-4 rounded-xl bg-brand-surface/50 border border-brand-border p-3">
              <div className="mb-1">
                <span className="text-xs text-brand-muted">Personality</span>
              </div>
              <p className="text-sm text-brand-text-secondary leading-relaxed">
                {companion.personality || 'No personality set'}
              </p>
              {companion.voice_id && (
                <div className="mt-2 pt-2 border-t border-brand-border/50 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-muted">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <span className="text-xs text-brand-muted">
                    {VOICES.find(v => v.id === companion.voice_id)?.label || 'Custom'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tips */}
        <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/5 p-4">
          <p className="text-sm font-medium text-brand-accent text-center mb-3">
            Send {companion.name} a tip
          </p>
          <div className="grid grid-cols-4 gap-2">
            {TIP_AMOUNTS.map(({ amount }) => (
              <button
                key={amount}
                onClick={() => handleTip(amount)}
                disabled={tipLoading !== null}
                className="py-2.5 px-1 rounded-lg border border-brand-accent/30 bg-brand-card text-brand-text hover:bg-brand-accent/15 hover:border-brand-accent/50 transition-colors disabled:opacity-50 font-medium"
              >
                <span className="block text-sm">{tipLoading === amount ? '...' : `$${amount}`}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation popup */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setConfirmDelete(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-[280px] bg-brand-card border border-brand-border rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 text-center">
              <p className="text-base font-semibold text-brand-text mb-1">Let {companion.name} go?</p>
              <p className="text-sm text-brand-muted leading-snug">
                She'll forget everything — your conversations, your memories together. She won't be waiting for you anymore.
              </p>
            </div>
            <div className="border-t border-brand-border flex">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 text-sm font-medium text-brand-text-secondary border-r border-brand-border active:bg-brand-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 text-sm font-semibold text-red-400 active:bg-brand-surface transition-colors disabled:opacity-50"
              >
                {deleting ? 'Letting go...' : 'Let her go'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
