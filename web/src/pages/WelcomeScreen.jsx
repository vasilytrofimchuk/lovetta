import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { Browser } from '@capacitor/browser'

const FEATURES = [
  { icon: '💬', title: 'Natural Conversations', desc: 'She remembers your stories' },
  { icon: '🎭', title: 'Unique Personality', desc: 'Choose or create your own' },
  { icon: '📸', title: 'Photos & Videos', desc: 'She sends AI-generated photos' },
  { icon: '🔔', title: 'Always Connected', desc: 'She reaches out to you' },
]

export default function WelcomeScreen() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    api.get('/api/companions/templates/preview').then(({ data }) => {
      const t = (data.templates || []).filter(t => t.avatar_url)
      if (t.length > 0) setTemplates(t)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (templates.length <= 1) return
    intervalRef.current = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentIdx(i => (i + 1) % templates.length)
        setVisible(true)
      }, 400)
    }, 3000)
    return () => clearInterval(intervalRef.current)
  }, [templates.length])

  const current = templates[currentIdx]

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col px-5 py-8 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <img src="/assets/brand/logo_l.png" alt="Lovetta" className="h-9 w-9 rounded-xl" />
        <span className="text-xl font-bold text-brand-text">Lovetta</span>
      </div>

      {/* Tagline */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-brand-text">Your AI Girlfriend</h1>
        <p className="text-brand-text-secondary text-sm mt-1">Meet someone who's always here for you</p>
      </div>

      {/* Rotating girl card */}
      <div className="flex justify-center mb-6">
        <div
          className="w-48 h-64 rounded-2xl overflow-hidden border border-brand-border bg-brand-card relative shadow-lg transition-opacity duration-400"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {current ? (
            <>
              <img
                src={current.avatar_url}
                alt={current.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <p className="text-white font-semibold text-sm">{current.name}</p>
                {current.tagline && (
                  <p className="text-white/70 text-xs mt-0.5 line-clamp-1">{current.tagline}</p>
                )}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3 mb-7">
        {FEATURES.map(f => (
          <div key={f.title} className="flex items-center gap-3">
            <span className="text-xl flex-shrink-0">{f.icon}</span>
            <div>
              <span className="text-brand-text text-sm font-semibold">{f.title}</span>
              <span className="text-brand-muted text-sm"> — {f.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/signup')}
        className="w-full py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors"
      >
        Continue
      </button>

      {/* Legal links */}
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={() => Browser.open({ url: 'https://lovetta.ai/privacy.html', presentationStyle: 'popover' })}
          className="text-brand-muted text-xs hover:text-brand-text-secondary transition-colors"
        >
          Privacy Policy
        </button>
        <button
          onClick={() => Browser.open({ url: 'https://lovetta.ai/terms.html', presentationStyle: 'popover' })}
          className="text-brand-muted text-xs hover:text-brand-text-secondary transition-colors"
        >
          Terms of Service
        </button>
      </div>
    </div>
  )
}
