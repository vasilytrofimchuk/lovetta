import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/api'
import GoogleSignIn from '../components/GoogleSignIn'
import TelegramSignIn from '../components/TelegramSignIn'
import AppleSignIn from '../components/AppleSignIn'
import { isCapacitor } from '../lib/platform'
import { clearOnboardingData } from '../lib/onboarding'
import logoSrc from '../../../public/assets/brand/logo_text.png'

export default function Login() {
  const { login, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Handle Google OAuth callback
  useEffect(() => {
    const oauth = searchParams.get('oauth')
    const accessToken = searchParams.get('accessToken')
    const refreshToken = searchParams.get('refreshToken')
    const oauthError = searchParams.get('error')
    const nextPath = searchParams.get('next')

    if (oauthError) {
      setError('Google sign-in failed. Please try again.')
    } else if (oauth === 'success' && accessToken && refreshToken) {
      ;(async () => {
        localStorage.setItem('lovetta-token', accessToken)
        localStorage.setItem('lovetta-refresh-token', refreshToken)
        clearOnboardingData()
        localStorage.removeItem('lovetta-ref')
        if (nextPath?.startsWith('/')) {
          window.location.replace(`/my${nextPath}`)
          return
        }
        await refreshUser()
      })()
    }
  }, [searchParams, refreshUser])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div data-testid="auth-form-shell" className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-brand-text-secondary mt-1">Sign in to continue</p>
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
                autoComplete="current-password"
                placeholder="Enter password"
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

          {error && (
            <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 px-4 rounded-2xl bg-brand-accent text-white text-base font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-brand-bg px-3 text-brand-muted">or</span>
          </div>
        </div>

        <div className="space-y-3">
          <AppleSignIn onError={setError} />
          <GoogleSignIn hideSeparator />
        </div>

        {!isCapacitor() && (
          <div className="mt-3">
            <TelegramSignIn />
          </div>
        )}

        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-brand-accent hover:underline">
            Forgot password?
          </Link>
        </div>

        <div className="mt-6 text-center text-sm text-brand-text-secondary">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand-accent hover:underline font-medium">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
