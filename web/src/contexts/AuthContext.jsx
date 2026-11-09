import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { clearOnboardingData } from '../lib/onboarding'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
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
    } catch (err) {
      setUser(null)
      // Only clear tokens on a real 401. A network blip, 5xx, or aborted
      // request shouldn't strand a logged-in user — `lib/api.js` already
      // handles 401-refresh on the next request, and forcing the user back
      // to login on every transient outage is a latent footgun (was the
      // suspected cause of the Apple-relay ghost cohort until disproved).
      if (err?.response?.status === 401) {
        localStorage.removeItem('lovetta-token')
        localStorage.removeItem('lovetta-refresh-token')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
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
    const utmSource = localStorage.getItem('lovetta-utm-source') || undefined
    const utmMedium = localStorage.getItem('lovetta-utm-medium') || undefined
    const utmCampaign = localStorage.getItem('lovetta-utm-campaign') || undefined
    const { data } = await api.post('/api/auth/signup', {
      email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode, tsClickId,
      utmSource, utmMedium, utmCampaign,
    })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
    clearOnboardingData()
    localStorage.removeItem('lovetta-ref')
    localStorage.removeItem('lovetta-utm-source')
    localStorage.removeItem('lovetta-utm-medium')
    localStorage.removeItem('lovetta-utm-campaign')
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
  }

  const deleteAccount = async () => {
    await api.delete('/api/auth/account')
    localStorage.removeItem('lovetta-token')
    localStorage.removeItem('lovetta-refresh-token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, deleteAccount, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
