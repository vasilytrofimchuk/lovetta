import { useNavigate } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import WelcomeCarousel from '../components/WelcomeCarousel'

const FEATURES = [
  { icon: '💬', title: 'Natural Conversations', desc: 'She picks up where you left off' },
  { icon: '🎭', title: 'Unique Personality', desc: 'Wake up a new girl or pick one you like' },
  { icon: '📸', title: 'Photos & Videos', desc: 'Selfies, videos, little surprises' },
  { icon: '🔔', title: 'Always Connected', desc: 'She can text first' },
]

export default function WelcomeScreen() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col app-page-gutter py-8 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <img src="/assets/brand/logo_l.png" alt="Lovetta" className="h-9 w-9 rounded-xl" />
        <span className="text-xl font-bold text-brand-text">Lovetta</span>
      </div>

      {/* Tagline */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-brand-text">Your AI Girlfriend</h1>
        <p className="text-brand-text-secondary text-sm mt-1">She picks up right where you left off</p>
      </div>

      <WelcomeCarousel />

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
