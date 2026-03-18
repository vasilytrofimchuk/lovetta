import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('verifying') // verifying, success, error

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    api.get(`/api/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div className="app-auth-shell text-center">
        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-brand-text-secondary">Verifying your email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="text-xl font-bold mb-2">Email verified!</h2>
            <p className="text-brand-text-secondary mb-6">Your email has been verified successfully.</p>
            <Link
              to="/"
              className="inline-block px-6 py-3 bg-brand-accent text-white rounded-lg font-semibold hover:bg-brand-accent-hover transition-colors"
            >
              Continue to Lovetta
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-bold mb-2 text-brand-error">Verification failed</h2>
            <p className="text-brand-text-secondary mb-6">
              The link may have expired or is invalid.
            </p>
            <Link to="/login" className="text-brand-accent hover:underline">
              Go to login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
