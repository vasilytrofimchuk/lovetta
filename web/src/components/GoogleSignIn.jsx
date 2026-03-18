import { useState } from 'react'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { useAuth } from '../contexts/AuthContext'
import api, { getErrorMessage } from '../lib/api'
import { isCapacitor } from '../lib/platform'

const GOOGLE_WEB_CLIENT_ID = '1007256282722-1n6bdvdcta96jf51bpajod0gjheo31ur.apps.googleusercontent.com'

export default function GoogleSignIn({ birthData, hideSeparator = false, onSuccess }) {
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNative = async () => {
    setLoading(true)
    setError('')
    try {
      await GoogleAuth.initialize({
        clientId: '1007256282722-jhi7vl1mj4jv12638fv5vh8ao9ribr3a.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      })
      const googleUser = await GoogleAuth.signIn()
      const idToken = googleUser.authentication?.idToken
      if (!idToken) throw new Error('No ID token from Google')

      const referralCode = localStorage.getItem('lovetta-ref') || undefined
      const { data } = await api.post('/api/auth/google/token', {
        idToken,
        birthMonth: birthData?.birthMonth,
        birthYear: birthData?.birthYear,
        termsAccepted: birthData?.termsAccepted,
        privacyAccepted: birthData?.privacyAccepted,
        aiConsentAccepted: birthData?.aiConsentAccepted,
        referralCode,
      })
      localStorage.setItem('lovetta-token', data.accessToken)
      localStorage.setItem('lovetta-refresh-token', data.refreshToken)
      await refreshUser()
      onSuccess?.()
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('Cancel')) return
      const serverErr = err?.response?.data?.error || ''
      if (serverErr === 'age_consent_required' || serverErr.includes('Birth date') || serverErr.includes('Consent required')) {
        window.location.href = '/signup'
        return
      }
      setError(serverErr || getErrorMessage(err) || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleWeb = () => {
    setLoading(true)
    let stateData = null
    if (birthData?.birthMonth && birthData?.birthYear) {
      stateData = birthData
    } else {
      try {
        const raw = localStorage.getItem('lovetta-landing-data')
        if (raw) stateData = JSON.parse(raw)
      } catch {}
    }
    const ref = localStorage.getItem('lovetta-ref')
    if (ref && stateData) stateData.referralCode = ref
    else if (ref) stateData = { referralCode: ref }

    let url = '/api/auth/google'
    if (stateData) url += '?state=' + encodeURIComponent(btoa(JSON.stringify(stateData)))
    window.location.href = url
  }

  return (
    <div>
      <div className={hideSeparator ? 'mt-3' : ''} />
      {!hideSeparator && (
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-brand-bg px-3 text-brand-muted">or</span>
          </div>
        </div>
      )}

      {error && (
        <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-2 mb-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={isCapacitor() ? handleNative : handleWeb}
        disabled={loading}
        className="w-full h-14 px-4 rounded-2xl border border-brand-border bg-brand-surface text-brand-text text-base font-semibold hover:bg-brand-card transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58z" fill="#EA4335"/>
        </svg>
        {loading ? 'Signing in...' : 'Continue with Google'}
      </button>
    </div>
  )
}
