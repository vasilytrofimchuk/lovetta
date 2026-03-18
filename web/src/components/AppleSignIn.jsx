import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api, { getErrorMessage } from '../lib/api'
import { isCapacitor } from '../lib/platform'

export default function AppleSignIn({ onError, ageData, onSuccess }) {
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)

  if (!isCapacitor()) return null

  async function handleAppleSignIn() {
    setLoading(true)
    try {
      // DEBUG: check native plugin registration
      const nativeBridge = window?.Capacitor?.Plugins?.SignInWithApple
      const bridgeStatus = `native plugin: ${nativeBridge ? 'FOUND' : 'MISSING'}, isNative: ${window?.Capacitor?.isNativePlatform?.()}`
      console.log('[AppleSignIn] bridge status:', bridgeStatus)

      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
      const result = await SignInWithApple.authorize({
        clientId: 'ai.lovetta.app',
        redirectURI: 'https://lovetta.ai',
        scopes: 'email name',
      })

      const response = result.response
      const landingData = JSON.parse(localStorage.getItem('lovetta-landing-data') || '{}')
      const referralCode = localStorage.getItem('lovetta-ref') || undefined

      const { data } = await api.post('/api/auth/apple', {
        identityToken: response.identityToken,
        fullName: response.givenName || response.familyName ? {
          givenName: response.givenName,
          familyName: response.familyName,
        } : null,
        email: response.email,
        birthMonth: ageData?.birthMonth || landingData.birthMonth,
        birthYear: ageData?.birthYear || landingData.birthYear,
        termsAccepted: ageData?.termsAccepted ?? landingData.termsAccepted,
        privacyAccepted: ageData?.privacyAccepted ?? landingData.privacyAccepted,
        aiConsentAccepted: ageData?.aiConsentAccepted ?? landingData.aiConsentAccepted,
        referralCode,
      })

      localStorage.setItem('lovetta-token', data.accessToken)
      localStorage.setItem('lovetta-refresh-token', data.refreshToken)
      await refreshUser()
      onSuccess?.()
    } catch (err) {
      // DEBUG: show full error details
      const nativePresent = !!window?.Capacitor?.Plugins?.SignInWithApple
      const dbg = JSON.stringify({
        nativePluginPresent: nativePresent,
        code: err?.code, message: err?.message, userCancelled: err?.userCancelled,
        name: err?.name, response: err?.response?.data, full: String(err),
        capacitorPlugins: Object.keys(window?.Capacitor?.Plugins || {}),
      }, null, 2)
      console.error('[AppleSignIn] raw error:', dbg)
      alert('[AppleSignIn debug]\n' + dbg)
      // User cancelled = no error
      if (err?.code === 'ERR_CANCELED' || err?.userCancelled === true || err?.message?.includes('cancel')) return
      const serverErr = err?.response?.data?.error || ''
      const msg = serverErr || getErrorMessage(err) || 'Apple sign-in failed'
      onError?.(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleAppleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-black font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
      {loading ? 'Signing in...' : 'Continue with Apple'}
    </button>
  )
}
