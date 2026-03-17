import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/api'
import AgeGate from '../components/AgeGate'
import LegalPopup from '../components/LegalPopup'
import GoogleSignIn from '../components/GoogleSignIn'
import TelegramSignIn from '../components/TelegramSignIn'
import AppleSignIn from '../components/AppleSignIn'
import { isCapacitor } from '../lib/platform'

export default function Signup() {
  const { signup } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [aiConsentChecked, setAiConsentChecked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const landingConsents = useRef(null)
  const nativeApp = isCapacitor()

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

    // In native app, consents are inline checkboxes — validate then proceed directly
    if (nativeApp) {
      if (!termsChecked || !privacyChecked || !aiConsentChecked) {
        setError('Please accept all agreements to continue')
        return
      }
      handleAccept({ termsAccepted: true, privacyAccepted: true, aiConsentAccepted: true })
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
      const referralCode = localStorage.getItem('lovetta-ref') || undefined
      await signup({
        email,
        password,
        birthMonth: parseInt(birthMonth),
        birthYear: parseInt(birthYear),
        termsAccepted,
        privacyAccepted,
        aiConsentAccepted,
        referralCode,
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

          {nativeApp && (
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0" />
                <span className="text-sm text-brand-text-secondary">
                  I agree to the{' '}
                  <a href="https://lovetta.ai/terms.html" target="_blank" className="text-brand-accent hover:underline">Terms of Service</a>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={privacyChecked} onChange={e => setPrivacyChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0" />
                <span className="text-sm text-brand-text-secondary">
                  I agree to the{' '}
                  <a href="https://lovetta.ai/privacy.html" target="_blank" className="text-brand-accent hover:underline">Privacy Policy</a>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={aiConsentChecked} onChange={e => setAiConsentChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0" />
                <span className="text-sm text-brand-text-secondary">
                  I understand my messages are processed by third-party AI services
                </span>
              </label>
            </div>
          )}

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

        <AppleSignIn onError={setError} ageData={birthMonth && birthYear ? {
          birthMonth: parseInt(birthMonth),
          birthYear: parseInt(birthYear),
          termsAccepted: nativeApp ? termsChecked : (landingConsents.current?.termsAccepted || false),
          privacyAccepted: nativeApp ? privacyChecked : (landingConsents.current?.privacyAccepted || false),
          aiConsentAccepted: nativeApp ? aiConsentChecked : (landingConsents.current?.aiConsentAccepted || false),
        } : null} />
        <GoogleSignIn birthData={birthMonth && birthYear ? {
          birthMonth: parseInt(birthMonth),
          birthYear: parseInt(birthYear),
          termsAccepted: nativeApp ? termsChecked : (landingConsents.current?.termsAccepted || false),
          privacyAccepted: nativeApp ? privacyChecked : (landingConsents.current?.privacyAccepted || false),
          aiConsentAccepted: nativeApp ? aiConsentChecked : (landingConsents.current?.aiConsentAccepted || false),
        } : null} />
        {!nativeApp && (
          <div className="mt-3">
            <TelegramSignIn />
          </div>
        )}

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
