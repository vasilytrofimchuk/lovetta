import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { VOICES } from '../lib/voices';
import useVoicePreview from '../hooks/useVoicePreview';

const GRADIENT_COLORS = [
  ['#ec4899', '#8040e0'], ['#f06060', '#ec4899'], ['#6060f0', '#40a0e0'],
  ['#40c080', '#40a0e0'], ['#f0a040', '#f06060'], ['#a040e0', '#6060f0'],
  ['#e06080', '#f0a040'], ['#40a0a0', '#40c080'], ['#c060e0', '#6080f0'],
  ['#f08060', '#f0c040'], ['#6080c0', '#a040e0'], ['#e04080', '#f06060'],
];


const STYLE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'real', label: 'Realistic' },
  { key: 'anime', label: 'Anime' },
];

const HAIR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'blonde', label: 'Blonde' },
  { key: 'brunette', label: 'Brunette' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'other', label: 'Other' },
];

const SKIN_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'dark', label: 'Dark' },
  { key: 'asian', label: 'Asian' },
];

const AGE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '18-22', label: '18-22' },
  { key: '23-29', label: '23-29' },
  { key: '30-39', label: '30-39' },
  { key: '40-50', label: '40-50' },
];

const INITIAL_AVATAR_COUNT = 13;

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

function TemplateCard({ t, onSelect }) {
  const videoRef = useRef(null);
  const cardRef = useRef(null);
  const [centered, setCentered] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = centered || hovered;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !t.video_url) return;

    // Active zone covers upper ~40% of viewport — 2 rows (4 cards) activate near the top
    const observer = new IntersectionObserver(
      ([entry]) => setCentered(entry.isIntersecting),
      { rootMargin: '-5% 0px -55% 0px', threshold: 0.1 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [t.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  return (
    <button ref={cardRef} onClick={() => onSelect(t)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl overflow-hidden aspect-[3/4] group">
      {t.avatar_url && (
        <img src={t.avatar_url} alt={t.name}
          className="absolute inset-0 w-full h-full object-cover" />
      )}
      {t.video_url && active && (
        <video ref={videoRef} src={t.video_url} muted loop playsInline autoPlay
          className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!t.avatar_url && !t.video_url && (
        <div className="absolute inset-0 bg-brand-card" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 text-xs font-bold group-hover:bg-brand-accent/60 transition-colors">i</div>
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-white font-bold text-lg leading-tight">{t.name}</span>
          <span className="text-brand-accent font-semibold text-base">{t.age}</span>
        </div>
        <p className="text-white/70 text-xs mt-0.5 line-clamp-2 leading-snug">{t.tagline}</p>
      </div>
    </button>
  );
}

export default function CompanionCreate() {
  const navigate = useNavigate();
  const { playingId, play: playVoice } = useVoicePreview();
  const [step, setStep] = useState('choose'); // choose, templates, custom, confirm
  const [templates, setTemplates] = useState([]);
  const [templateFilter, setTemplateFilter] = useState('all'); // all, realistic, anime
  const [selected, setSelected] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customAvatar, setCustomAvatar] = useState(null); // null = initials, string = URL
  const [previewAvatar, setPreviewAvatar] = useState(null); // avatar object for video popup
  const [avatars, setAvatars] = useState([]);
  const [customTraits, setCustomTraits] = useState([]);
  const [newTrait, setNewTrait] = useState('');
  const [customVoice, setCustomVoice] = useState('hA4zGnmTwX2NQiTRMt7o');
  const [styleFilter, setStyleFilter] = useState('all');
  const [hairFilter, setHairFilter] = useState('all');
  const [skinFilter, setSkinFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  const [imagining, setImagining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [confirmTrait, setConfirmTrait] = useState('');
  const [appConfig, setAppConfig] = useState({ avatarAgeFilter: false, avatarSkinFilter: false });

  useEffect(() => {
    api.get('/api/app-config').then(({ data }) => setAppConfig(data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/api/companions/templates').then(({ data }) => {
      const arr = data.templates || [];
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      setTemplates(arr);
    }).catch(() => {});
  }, []);

  // Fetch custom avatars from DB with filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (styleFilter !== 'all') params.set('style', styleFilter);
    if (hairFilter !== 'all') params.set('hair', hairFilter);
    if (skinFilter !== 'all') params.set('skin', skinFilter);
    if (ageFilter !== 'all') params.set('age', ageFilter);
    api.get(`/api/companions/avatars?${params}`).then(({ data }) => {
      setAvatars(data.avatars || []);
      setShowAllAvatars(false);
    }).catch(() => {});
  }, [styleFilter, hairFilter, skinFilter, ageFilter]);

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

  async function imaginePersonality() {
    if (imagining) return;
    setImagining(true);
    try {
      const filters = { style: styleFilter, hair: hairFilter, skin: skinFilter, age: ageFilter };
      const { data } = await api.post('/api/companions/imagine-personality', {
        text: customPersonality.trim() || null,
        filters,
      });
      if (data.personality) setCustomPersonality(data.personality);
    } catch {}
    setImagining(false);
  }

  function submitCustom() {
    if (!customName.trim() || !customPersonality.trim()) return;
    const avatarObj = customAvatar ? avatars.find(a => a.image_url === customAvatar) : null;
    setSelected({
      name: customName.trim(),
      personality: customPersonality.trim(),
      avatar_url: customAvatar,
      video_url: avatarObj?.video_url || null,
      tagline: '',
      traits: customTraits,
      communication_style: 'playful',
      age: 22,
      voice_id: customVoice,
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
        ? { templateId: selected.id, name: selected.name, personality: selected.personality, traits: selected.traits, voiceId: selected.voice_id }
        : { name: selected.name, personality: selected.personality, avatarUrl: selected.avatar_url, videoUrl: selected.video_url, traits: selected.traits, voiceId: selected.voice_id };

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
            {step === 'custom' && 'Be the Creator'}
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
              <div className="text-2xl mb-2">💫</div>
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
              <div className="font-semibold text-brand-text">Be the Creator</div>
              <div className="text-sm text-brand-text-secondary mt-1">Design her look, name, and personality yourself</div>
            </button>
          </div>
        )}

        {/* Step: Template grid — photo cards like dating app */}
        {step === 'templates' && (
          <>
            {/* Style filter tabs */}
            <div className="flex gap-2 mb-4">
              {[{ key: 'all', label: 'All' }, { key: 'realistic', label: 'Realistic' }, { key: 'anime', label: 'Anime' }].map(f => (
                <button key={f.key} onClick={() => setTemplateFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${templateFilter === f.key ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-text-secondary hover:text-brand-text'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {templates.filter(t => templateFilter === 'all' || (templateFilter === 'anime' ? t.style === 'anime' : t.style !== 'anime')).map(t => (
                <TemplateCard key={t.id} t={t} onSelect={selectTemplate} />
              ))}
            </div>
            <button onClick={() => setStep('custom')}
              className="w-full mt-4 p-4 rounded-xl border border-dashed border-brand-accent/40 text-brand-accent hover:bg-brand-accent/10 transition-colors flex items-center justify-center gap-2">
              <span className="text-xl leading-none">✨</span>
              <span className="font-semibold">Be the Creator</span>
            </button>
          </>
        )}

        {/* Step: Custom form */}
        {step === 'custom' && (
          <div className="space-y-5">
            {/* Avatar selection */}
            <div>
              <label className="block text-sm text-brand-text-secondary mb-2">Choose her look</label>
              {/* Filters */}
              {[
                { filters: STYLE_FILTERS, value: styleFilter, set: setStyleFilter, label: 'Style' },
                { filters: HAIR_FILTERS, value: hairFilter, set: setHairFilter, label: 'Hair' },
                ...(appConfig.avatarSkinFilter ? [{ filters: SKIN_FILTERS, value: skinFilter, set: setSkinFilter, label: 'Skin' }] : []),
                ...(appConfig.avatarAgeFilter ? [{ filters: AGE_FILTERS, value: ageFilter, set: setAgeFilter, label: 'Age' }] : []),
              ].map(row => (
                <div key={row.label} className="flex gap-1.5 mb-1.5 flex-wrap items-center">
                  <span className="text-xs text-brand-muted py-1 w-8">{row.label}</span>
                  {row.filters.map(c => (
                    <button key={c.key} type="button" onClick={() => row.set(c.key)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${row.value === c.key ? 'bg-brand-accent text-white' : 'bg-brand-card text-brand-text-secondary hover:bg-brand-accent/20'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="h-1" />
              {(() => {
                const visible = showAllAvatars ? avatars : avatars.slice(0, INITIAL_AVATAR_COUNT);
                const hasMore = avatars.length > INITIAL_AVATAR_COUNT && !showAllAvatars;
                return (
                  <div className="grid grid-cols-5 gap-2">
                    {/* Empty avatar — initials */}
                    <button type="button" onClick={() => setCustomAvatar(null)}
                      className={`relative w-full aspect-square rounded-full border-2 transition-colors flex items-center justify-center overflow-hidden ${customAvatar === null ? 'border-brand-accent' : 'border-brand-border hover:border-brand-accent/40'}`}>
                      {customName.trim() ? (() => {
                        const [from, to] = getGradient(customName);
                        return (
                          <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold text-lg"
                            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                            {customName.trim()[0].toUpperCase()}
                          </div>
                        );
                      })() : (
                        <div className="w-full h-full rounded-full bg-brand-card" />
                      )}
                    </button>
                    {visible.map(a => (
                      <button key={a.image_url} type="button" onClick={() => {
                        setCustomAvatar(a.image_url);
                        if (a.video_url) setPreviewAvatar(a);
                        if (a.id) api.post(`/api/companions/avatars/${a.id}/pick`).catch(() => {});
                      }}
                        className={`relative w-full aspect-square rounded-full overflow-hidden border-2 transition-colors ${customAvatar === a.image_url ? 'border-brand-accent' : 'border-brand-border hover:border-brand-accent/40'}`}>
                        <img src={a.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {a.video_url && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21" /></svg>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                    {hasMore && (
                      <button type="button" onClick={() => setShowAllAvatars(true)}
                        className="w-full aspect-square rounded-full border-2 border-dashed border-brand-accent/40 flex items-center justify-center text-brand-accent hover:bg-brand-accent/10 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

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
              <div className="relative">
                <textarea
                  value={customPersonality} onChange={e => setCustomPersonality(e.target.value)}
                  placeholder={"e.g. She's a witty barista who loves late-night conversations about movies and music. Flirty but thoughtful, she remembers every detail about you and always knows how to make you smile."}
                  rows={5}
                  className="w-full p-3 pb-10 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none"
                  maxLength={2000}
                />
                <button type="button" onClick={imaginePersonality} disabled={imagining}
                  className="absolute right-2 bottom-2 px-3 py-1 rounded-full bg-brand-accent/15 text-brand-accent text-xs font-medium hover:bg-brand-accent/25 disabled:opacity-50 transition-colors">
                  {imagining ? '...' : customPersonality.trim() ? 'Improve' : 'Imagine'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Traits</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customTraits.map(t => (
                  <button key={t} type="button" onClick={() => setCustomTraits(customTraits.filter(x => x !== t))}
                    className="text-xs px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 hover:bg-brand-accent/20 transition-colors flex items-center gap-1">
                    {t} <span className="text-brand-accent/60">x</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={newTrait}
                  onChange={e => setNewTrait(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = newTrait.trim().toLowerCase();
                      if (t && !customTraits.includes(t) && customTraits.length < 10) {
                        setCustomTraits([...customTraits, t]);
                        setNewTrait('');
                      }
                    }
                  }}
                  placeholder="e.g. playful, witty, caring..."
                  className="flex-1 p-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted text-sm focus:outline-none focus:border-brand-accent"
                  maxLength={30}
                />
                <button type="button" onClick={() => {
                  const t = newTrait.trim().toLowerCase();
                  if (t && !customTraits.includes(t) && customTraits.length < 10) {
                    setCustomTraits([...customTraits, t]);
                    setNewTrait('');
                  }
                }} disabled={!newTrait.trim()}
                  className="px-4 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary hover:bg-brand-border disabled:opacity-30 transition-colors">
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1">Voice</label>
              <div className="grid grid-cols-3 gap-2">
                {VOICES.map(v => (
                  <button key={v.id} type="button" onClick={() => { setCustomVoice(v.id); playVoice(v.id); }}
                    className={`p-2 rounded-lg border text-left transition-colors relative ${customVoice === v.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-surface hover:border-brand-accent/40'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`absolute top-1.5 right-1.5 ${playingId === v.id ? 'text-brand-accent animate-pulse' : 'text-brand-muted'}`}>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      {playingId === v.id && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
                    </svg>
                    <div className={`text-sm font-medium ${customVoice === v.id ? 'text-brand-accent' : 'text-brand-text'}`}>{v.label}</div>
                    <div className="text-xs text-brand-muted">{v.desc}</div>
                  </button>
                ))}
              </div>
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
                    preload="auto"
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

            {/* Name */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Name</div>
              <input type="text" value={selected.name}
                onChange={e => setSelected({ ...selected, name: e.target.value })}
                className="w-full bg-transparent text-brand-text font-semibold text-lg focus:outline-none border-b border-transparent focus:border-brand-accent transition-colors"
                maxLength={30} />
            </div>

            {/* Personality */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Personality</div>
              <textarea value={selected.personality}
                onChange={e => setSelected({ ...selected, personality: e.target.value })}
                rows={4}
                className="w-full bg-transparent text-sm text-brand-text-secondary focus:outline-none focus:text-brand-text resize-none border-b border-transparent focus:border-brand-accent transition-colors"
                maxLength={2000} />
            </div>

            {/* Traits */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-1">Traits</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(Array.isArray(selected.traits) ? selected.traits : []).map((t, i) => (
                  <button key={i} type="button"
                    onClick={() => setSelected({ ...selected, traits: selected.traits.filter((_, j) => j !== i) })}
                    className="px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-medium hover:bg-brand-accent/20 transition-colors flex items-center gap-1">
                    {t} <span className="text-brand-accent/50">x</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={confirmTrait}
                  onChange={e => setConfirmTrait(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = confirmTrait.trim().toLowerCase();
                      const traits = Array.isArray(selected.traits) ? selected.traits : [];
                      if (t && !traits.includes(t) && traits.length < 10) {
                        setSelected({ ...selected, traits: [...traits, t] });
                        setConfirmTrait('');
                      }
                    }
                  }}
                  placeholder="Add trait..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-brand-surface border border-brand-border text-brand-text text-xs focus:outline-none focus:border-brand-accent"
                  maxLength={30} />
                <button type="button" onClick={() => {
                  const t = confirmTrait.trim().toLowerCase();
                  const traits = Array.isArray(selected.traits) ? selected.traits : [];
                  if (t && !traits.includes(t) && traits.length < 10) {
                    setSelected({ ...selected, traits: [...traits, t] });
                    setConfirmTrait('');
                  }
                }} disabled={!confirmTrait.trim()}
                  className="px-3 rounded-lg bg-brand-surface border border-brand-border text-brand-text-secondary text-xs hover:bg-brand-border disabled:opacity-30 transition-colors">
                  +
                </button>
              </div>
            </div>

            {/* Voice */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4">
              <div className="text-sm text-brand-muted mb-2">Voice</div>
              <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                {VOICES.map(v => (
                  <button key={v.id} type="button"
                    onClick={() => { setSelected({ ...selected, voice_id: v.id }); playVoice(v.id); }}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-colors relative ${(selected.voice_id || '') === v.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-surface hover:border-brand-accent/40'}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={`absolute top-1 right-1 ${playingId === v.id ? 'text-brand-accent animate-pulse' : 'text-brand-muted'}`}>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      {playingId === v.id && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
                    </svg>
                    <div className={`text-xs font-medium ${(selected.voice_id || '') === v.id ? 'text-brand-accent' : 'text-brand-text'}`}>{v.label}</div>
                    <div className="text-[10px] text-brand-muted leading-tight">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm text-center">
                {error}
              </div>
            )}

            <button onClick={createCompanion} disabled={creating || !selected.name.trim()}
              className="w-full py-3 rounded-xl bg-brand-accent text-white font-semibold disabled:opacity-40 hover:bg-brand-accent-hover transition-colors">
              {creating ? 'Bringing her to life...' : `Awaken ${selected.name.trim() || '...'}`}
            </button>
          </div>
        )}
      </div>

      {/* Video preview popup — plays once then auto-closes */}
      {previewAvatar && previewAvatar.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreviewAvatar(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden" onClick={() => setPreviewAvatar(null)}>
            <video src={previewAvatar.video_url} autoPlay muted playsInline
              onEnded={() => setPreviewAvatar(null)}
              className="w-full aspect-[3/4] object-cover" />
          </div>
        </div>
      )}
    </div>
  );
}
