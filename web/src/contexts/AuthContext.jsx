import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { isCapacitor } from '../lib/platform'

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
      // Include age/consent data from landing page if available
      const payload = { initData: tgWebApp.initData }
      try {
        const raw = localStorage.getItem('lovetta-landing-data')
        if (raw) {
          const ld = JSON.parse(raw)
          if (ld.birthMonth) payload.birthMonth = ld.birthMonth
          if (ld.birthYear) payload.birthYear = ld.birthYear
          if (ld.termsAccepted) payload.termsAccepted = ld.termsAccepted
          if (ld.privacyAccepted) payload.privacyAccepted = ld.privacyAccepted
          if (ld.aiConsentAccepted) payload.aiConsentAccepted = ld.aiConsentAccepted
        }
      } catch {}

      // Include referral code if present
      const ref = localStorage.getItem('lovetta-ref')
      if (ref) payload.referralCode = ref

      api.post('/api/auth/telegram', payload)
        .then(({ data }) => {
          localStorage.setItem('lovetta-token', data.accessToken)
          localStorage.setItem('lovetta-refresh-token', data.refreshToken)
          localStorage.removeItem('lovetta-landing-data')
          localStorage.removeItem('lovetta-ref')
          setUser(data.user)
          tgWebApp.ready?.()
          tgWebApp.expand?.()
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

  // Initialize RevenueCat when user authenticates (iOS only)
  useEffect(() => {
    if (user?.id && isCapacitor()) {
      import('../lib/revenuecat').then(({ initRevenueCat }) => {
        initRevenueCat(user.id).catch(() => {})
      })
    }
  }, [user?.id])

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
    setUser(data.user)
    return data
  }

  const signup = async ({ email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode }) => {
    const { data } = await api.post('/api/auth/signup', {
      email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode,
    })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
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
