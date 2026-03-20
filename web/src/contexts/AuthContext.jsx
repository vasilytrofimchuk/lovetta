import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { clearOnboardingData, getPostAuthPath, readOnboardingData } from '../lib/onboarding'
import { trackSignup } from '../lib/pixels'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

// Detect Telegram Mini App
function getTelegramWebApp() {
  try {
    const tg = window.Telegram?.WebApp
    if (tg?.initData) return tg
  } catch {}
  return null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('lovetta-token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { data } = await api.get('/api/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
      localStorage.removeItem('lovetta-token')
      localStorage.removeItem('lovetta-refresh-token')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tgWebApp = getTelegramWebApp()

    if (tgWebApp) {
      // Telegram Mini App — auto-auth via initData
      const payload = { initData: tgWebApp.initData }
      const onboardingData = readOnboardingData()
      const postAuthPath = getPostAuthPath(onboardingData)
      if (onboardingData?.birthMonth) payload.birthMonth = onboardingData.birthMonth
      if (onboardingData?.birthYear) payload.birthYear = onboardingData.birthYear
      if (onboardingData?.termsAccepted) payload.termsAccepted = onboardingData.termsAccepted
      if (onboardingData?.privacyAccepted) payload.privacyAccepted = onboardingData.privacyAccepted
      if (onboardingData?.aiConsentAccepted) payload.aiConsentAccepted = onboardingData.aiConsentAccepted

      // Include referral code + click_id if present
      const ref = localStorage.getItem('lovetta-ref')
      if (ref) payload.referralCode = ref
      const tsClickId = localStorage.getItem('lovetta-ts-click-id')
      if (tsClickId) payload.tsClickId = tsClickId

      api.post('/api/auth/telegram', payload)
        .then(({ data }) => {
          localStorage.setItem('lovetta-token', data.accessToken)
          localStorage.setItem('lovetta-refresh-token', data.refreshToken)
          clearOnboardingData()
          localStorage.removeItem('lovetta-ref')
          trackSignup()
          setUser(data.user)
          tgWebApp.ready?.()
          tgWebApp.expand?.()
          if (postAuthPath) {
            window.location.replace(`/my${postAuthPath}`)
          }
        })
        .catch((err) => {
          // If age/consent required, redirect to signup
          const errMsg = err?.response?.data?.error
          if (errMsg === 'age_consent_required') {
            window.location.href = '/my/signup?from=telegram'
            return
          }
          // Fallback to normal auth check
          refreshUser()
        })
        .finally(() => setLoading(false))
    } else {
      refreshUser()
    }
  }, [refreshUser])

  // Heartbeat every 60s for logged-in users to keep last_activity fresh
  useEffect(() => {
    if (!user) return
    const hb = setInterval(() => {
      api.get('/api/auth/me').catch(() => {})
    }, 60000)
    return () => clearInterval(hb)
  }, [user])

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
    setUser(data.user)
    return data
  }

  const signup = async ({ email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode }) => {
    const tsClickId = localStorage.getItem('lovetta-ts-click-id') || undefined
    const { data } = await api.post('/api/auth/signup', {
      email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode, tsClickId,
    })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
    clearOnboardingData()
    localStorage.removeItem('lovetta-ref')
    setUser(data.user)
    return data
  }

  const logout = async () => {
    try {
      await api.post('/api/auth/logout')
    } catch { /* ignore */ }
    localStorage.removeItem('lovetta-token')
    localStorage.removeItem('lovetta-refresh-token')
    setUser(null)

    // If in Telegram, close the mini app
    const tg = getTelegramWebApp()
    if (tg) tg.close?.()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
