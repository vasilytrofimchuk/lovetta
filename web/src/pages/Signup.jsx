import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api, { getErrorMessage } from '../lib/api'
import AgeGate from '../components/AgeGate'
import LegalPopup from '../components/LegalPopup'
import GoogleSignIn from '../components/GoogleSignIn'

export default function Signup() {
  const { signup, refreshUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  const [googleCredential, setGoogleCredential] = useState(null)
  const [showGoogleAge, setShowGoogleAge] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

    setShowLegal(true)
  }

  const handleAccept = async ({ termsAccepted, privacyAccepted }) => {
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
          <p className="text-brand-text-secondary mt-1">Meet your AI companion</p>
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

        <GoogleSignIn
          onAgeRequired={(credential) => {
            setGoogleCredential(credential)
            setShowGoogleAge(true)
          }}
          onError={(msg) => setError(msg)}
        />

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

      {showGoogleAge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-brand-card border border-brand-border rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Almost there</h3>
            <p className="text-sm text-brand-text-secondary mb-4">Please confirm your age to continue.</p>
            <AgeGate
              birthMonth={birthMonth}
              birthYear={birthYear}
              onChange={({ birthMonth: m, birthYear: y }) => { setBirthMonth(m); setBirthYear(y) }}
            />
            {error && (
              <div className="text-brand-error text-sm mt-3">{error}</div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowGoogleAge(false); setGoogleCredential(null); setError('') }}
                className="flex-1 py-3 rounded-lg border border-brand-border text-brand-text-secondary"
              >Cancel</button>
              <button
                disabled={loading || !birthMonth || !birthYear}
                onClick={async () => {
                  setError('')
                  const now = new Date()
                  const age = now.getFullYear() - parseInt(birthYear) - (now.getMonth() + 1 < parseInt(birthMonth) ? 1 : 0)
                  if (age < 18) { setError('You must be 18 or older'); return }
                  setLoading(true)
                  try {
                    const { data } = await api.post('/api/auth/google', {
                      credential: googleCredential,
                      birthMonth: parseInt(birthMonth),
                      birthYear: parseInt(birthYear),
                    })
                    localStorage.setItem('lovetta-token', data.accessToken)
                    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
                    await refreshUser()
                  } catch (err) {
                    setError(getErrorMessage(err))
                  } finally {
                    setLoading(false)
                  }
                }}
                className="flex-1 py-3 rounded-lg bg-brand-accent text-white font-semibold disabled:opacity-50"
              >{loading ? 'Creating...' : 'Continue'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
