import { useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../lib/api'
import { getAppPageHeight } from '../lib/layout'

export default function ForgotPassword() {
  const pageHeight = getAppPageHeight()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-brand-bg" style={{ height: pageHeight }}>
      <div className="app-scroll-region h-full overflow-y-auto flex items-center justify-center p-4">
        <div className="app-auth-shell">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Reset password</h1>
            <p className="text-brand-text-secondary mt-1">We'll send you a reset link</p>
          </div>

          {sent ? (
            <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4 text-center">
              <p className="text-brand-success font-medium">Check your email</p>
              <p className="text-brand-text-secondary text-sm mt-2">
                If an account exists for {email}, you'll receive a password reset link.
              </p>
              <Link to="/login" className="inline-block mt-4 text-brand-accent hover:underline text-sm">
                Back to login
              </Link>
            </div>
          ) : (
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
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-brand-accent hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
