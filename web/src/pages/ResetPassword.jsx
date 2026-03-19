import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../lib/api'
import { getAppPageHeight } from '../lib/layout'

export default function ResetPassword() {
  const pageHeight = getAppPageHeight()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token, password })
      setDone(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="bg-brand-bg" style={{ height: pageHeight }}>
        <div className="app-scroll-region h-full overflow-y-auto flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-brand-error mb-4">Invalid or missing reset token.</p>
            <Link to="/forgot-password" className="text-brand-accent hover:underline">
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-brand-bg" style={{ height: pageHeight }}>
      <div className="app-scroll-region h-full overflow-y-auto flex items-center justify-center p-4">
        <div className="app-auth-shell">
          <h1 className="text-2xl font-bold text-center mb-8">Set new password</h1>

          {done ? (
            <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4 text-center">
              <p className="text-brand-success font-medium">Password updated!</p>
              <Link to="/login" className="inline-block mt-4 text-brand-accent hover:underline">
                Sign in with your new password
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow"
                />
              </div>
              <div>
                <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Repeat password"
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
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
