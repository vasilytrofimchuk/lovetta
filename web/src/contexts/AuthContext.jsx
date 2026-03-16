import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

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
      api.post('/api/auth/telegram', { initData: tgWebApp.initData })
        .then(({ data }) => {
          localStorage.setItem('lovetta-token', data.accessToken)
          localStorage.setItem('lovetta-refresh-token', data.refreshToken)
          setUser(data.user)
          tgWebApp.ready?.()
          tgWebApp.expand?.()
        })
        .catch(() => {
          // Fallback to normal auth check
          refreshUser()
        })
        .finally(() => setLoading(false))
    } else {
      refreshUser()
    }
  }, [refreshUser])

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
    setUser(data.user)
    return data
  }

  const signup = async ({ email, password, birthMonth, birthYear, termsAccepted, privacyAccepted }) => {
    const { data } = await api.post('/api/auth/signup', {
      email, password, birthMonth, birthYear, termsAccepted, privacyAccepted,
    })
    localStorage.setItem('lovetta-token', data.accessToken)
    localStorage.setItem('lovetta-refresh-token', data.refreshToken)
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
