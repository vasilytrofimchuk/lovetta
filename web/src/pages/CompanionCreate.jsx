import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
  ['#e06080', '#f0a040'], ['#40a0a0', '#40c080'], ['#c060e0', '#6080f0'],
  ['#f08060', '#f0c040'], ['#6080c0', '#a040e0'], ['#e04080', '#f06060'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

export default function CompanionCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState('choose'); // choose, templates, custom, confirm
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/companions/templates').then(({ data }) => setTemplates(data.templates || [])).catch(() => {});
  }, []);

  function selectSurprise() {
    if (!templates.length) return;
    const random = templates[Math.floor(Math.random() * templates.length)];
    setSelected({ ...random, isTemplate: true });
    setStep('confirm');
  }

  function selectTemplate(t) {
    setSelected({ ...t, isTemplate: true });
    setStep('confirm');
  }

  function submitCustom() {
    if (!customName.trim() || !customPersonality.trim()) return;
    setSelected({
      name: customName.trim(),
      personality: customPersonality.trim(),
      tagline: '',
      traits: [],
      communication_style: 'playful',
      age: 22,
      isTemplate: false,
    });
    setStep('confirm');
  }

  async function createCompanion() {
    if (creating) return;
    setCreating(true);
    setError(null);

    try {
      const body = selected.isTemplate
        ? { templateId: selected.id, name: selected.name }
        : { name: selected.name, personality: selected.personality };

      const { data } = await api.post('/api/companions', body);
      navigate(`/chat/${data.companion.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create companion');
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => {
            if (step === 'choose') navigate('/');
            else if (step === 'confirm' && selected?.isTemplate) setStep('templates');
            else if (step === 'confirm') setStep('custom');
            else setStep('choose');
          }}
            className="text-brand-muted hover:text-brand-text transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-brand-text">
            {step === 'choose' && 'Bring Her to Life'}
            {step === 'templates' && 'Choose a Soul'}
            {step === 'custom' && 'Create from Scratch'}
            {step === 'confirm' && 'Ready to Awaken'}
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Step: Choose path */}
        {step === 'choose' && (
          <div className="space-y-3">
            <button onClick={selectSurprise}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">🎲</div>
              <div className="font-semibold text-brand-text">Surprise Me</div>
              <div className="text-sm text-brand-text-secondary mt-1">Let fate decide who comes to life</div>
            </button>
            <button onClick={() => setStep('templates')}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">💜</div>
              <div className="font-semibold text-brand-text">Choose a Soul</div>
              <div className="text-sm text-brand-text-secondary mt-1">{templates.length} unique souls waiting to be awakened</div>
            </button>
            <button onClick={() => setStep('custom')}
              className="w-full p-5 rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent/40 transition-colors text-left">
              <div className="text-2xl mb-2">✨</div>
              <div className="font-semibold text-brand-text">Create from Scratch</div>
              <div className="text-sm text-brand-text-secondary mt-1">Shape a new soul from your imagination</div>
            </button>
          </div>
        )}

        {/* Step: Template grid — photo cards like dating app */}
        {step === 'templates' && (
          <div className="grid grid-cols-2 gap-3">
            {templates.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className="relative rounded-2xl overflow-hidden aspect-[3/4] group">
                {t.video_url ? (
                  <video src={t.video_url} autoPlay muted loop playsInline
                    poster={t.avatar_url} preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : t.avatar_url ? (
                  <img src={t.avatar_url} alt={t.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="absolute inset-0 bg-brand-card" />
                )}
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {/* Name + age + tagline */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-white font-bold text-lg leading-tight">{t.name}</span>
                    <span className="text-brand-accent font-semibold text-base">{t.age}</span>
                  </div>
                  <p className="text-white/70 text-xs mt-0.5 line-clamp-2 leading-snug">{t.tagline}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step: Custom form */}
        {step === 'custom' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Name</label>
              <input
                type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                placeholder="Give her a name..."
                className="w-full p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent"
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Personality</label>
              <textarea
                value={customPersonality} onChange={e => setCustomPersonality(e.target.value)}
                placeholder="Describe who she is — her personality, passions, and how she connects with you..."
                rows={5}
                className="w-full p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none"
                maxLength={2000}
              />
            </div>
            <button onClick={submitCustom}
              disabled={!customName.trim() || !customPersonality.trim()}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-40 hover:bg-brand-accent-hover transition-colors">
              Continue
            </button>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && selected && (
          <div className="space-y-4">
            {/* Hero photo card */}
            {selected.avatar_url || selected.video_url ? (
              <div className="relative rounded-2xl overflow-hidden aspect-[3/4]">
                {selected.video_url ? (
                  <video src={selected.video_url} autoPlay muted loop playsInline
                    poster={selected.avatar_url}
                    className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <img src={selected.avatar_url} alt={selected.name}
                    className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white font-bold text-2xl">{selected.name}</span>
                    <span className="text-brand-accent font-semibold text-xl">{selected.age}</span>
                  </div>
                  {selected.tagline && (
                    <p className="text-white/70 text-sm mt-1">{selected.tagline}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                {(() => {
                  const [from, to] = getGradient(selected.name);
                  return (
                    <div className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-white font-bold text-3xl"
                      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                      {selected.name[0]}
                    </div>
                  );
                })()}
                <h2 className="text-xl font-bold text-brand-text">{selected.name}</h2>
                {selected.tagline && (
                  <p className="text-brand-text-secondary mt-1">{selected.tagline}</p>
                )}
              </div>
            )}

            {/* Personality preview */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Personality</div>
              <p className="text-sm text-brand-text-secondary line-clamp-4">{selected.personality}</p>
            </div>

            {/* Traits */}
            {selected.traits && selected.traits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(selected.traits) ? selected.traits : []).map((t, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm text-center">
                {error}
              </div>
            )}

            <button onClick={createCompanion} disabled={creating}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-60 hover:bg-brand-accent-hover transition-colors">
              {creating ? 'Bringing her to life...' : `Awaken ${selected.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
