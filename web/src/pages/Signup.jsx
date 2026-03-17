import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/api'
import AgeGate from '../components/AgeGate'
import LegalPopup from '../components/LegalPopup'
import GoogleSignIn from '../components/GoogleSignIn'
import TelegramSignIn from '../components/TelegramSignIn'

export default function Signup() {
  const { signup } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const landingConsents = useRef(null)

  // Pre-fill from landing page data
  useEffect(() => {
    const from = searchParams.get('from')
    if (from === 'landing' || from === 'telegram') {
      try {
        const raw = localStorage.getItem('lovetta-landing-data')
        if (raw) {
          const data = JSON.parse(raw)
          if (data.birthMonth) setBirthMonth(String(data.birthMonth))
          if (data.birthYear) setBirthYear(String(data.birthYear))
          if (data.termsAccepted && data.privacyAccepted && data.aiConsentAccepted) {
            landingConsents.current = {
              termsAccepted: true,
              privacyAccepted: true,
              aiConsentAccepted: true,
            }
          }
          if (data.selectedPlan) {
            localStorage.setItem('lovetta-selected-plan', data.selectedPlan)
          }
          localStorage.removeItem('lovetta-landing-data')
        }
      } catch {}
    }
  }, [searchParams])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password || !birthMonth || !birthYear) {
      setError('Please fill in all fields')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    // Check age client-side
    const now = new Date()
    const age = now.getFullYear() - parseInt(birthYear) - (now.getMonth() + 1 < parseInt(birthMonth) ? 1 : 0)
    if (age < 18) {
      setError('You must be 18 or older to use Lovetta')
      return
    }

    // Skip legal popup if consents already given on landing page
    if (landingConsents.current) {
      handleAccept(landingConsents.current)
      return
    }

    setShowLegal(true)
  }

  const handleAccept = async ({ termsAccepted, privacyAccepted, aiConsentAccepted }) => {
    setShowLegal(false)
    setLoading(true)
    try {
      await signup({
        email,
        password,
        birthMonth: parseInt(birthMonth),
        birthYear: parseInt(birthYear),
        termsAccepted,
        privacyAccepted,
        aiConsentAccepted,
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/assets/brand/logo_text.png" alt="Lovetta" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-brand-text-secondary mt-1">Meet your AI girlfriend</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow"
            />
          </div>

          <div>
            <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min 8 characters"
                className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text text-sm"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <AgeGate
            birthMonth={birthMonth}
            birthYear={birthYear}
            onChange={({ birthMonth: m, birthYear: y }) => { setBirthMonth(m); setBirthYear(y) }}
          />

          {error && (
            <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-accent text-white rounded-lg font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <GoogleSignIn birthData={birthMonth && birthYear ? {
          birthMonth: parseInt(birthMonth),
          birthYear: parseInt(birthYear),
          termsAccepted: landingConsents.current?.termsAccepted || false,
          privacyAccepted: landingConsents.current?.privacyAccepted || false,
          aiConsentAccepted: landingConsents.current?.aiConsentAccepted || false,
        } : null} />
        <div className="mt-3">
          <TelegramSignIn />
        </div>

        <div className="mt-6 text-center text-sm text-brand-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-accent hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>

      {showLegal && (
        <LegalPopup
          onAccept={handleAccept}
          onClose={() => setShowLegal(false)}
        />
      )}
    </div>
  )
}
