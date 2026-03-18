import axios from 'axios'

const isNative = !!(window.Capacitor?.isNativePlatform?.())
const LOGIN_PATH = isNative ? '/login' : '/my/login'

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function joinUrl(base, path) {
  if (!base) return path
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function resolveApiBase() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim()
  const host = window.location.hostname

  if (envUrl) {
    try {
      const parsed = new URL(envUrl, window.location.origin)
      if (!isNative && isLoopbackHost(parsed.hostname) && !isLoopbackHost(host)) {
        return ''
      }
      return envUrl.replace(/\/$/, '')
    } catch {}
  }

  return isNative ? 'https://lovetta.ai' : ''
}

export const API_BASE = resolveApiBase()

export function apiUrl(path = '') {
  if (!path) return API_BASE
  if (/^https?:\/\//.test(path)) return path
  return joinUrl(API_BASE, path)
}

function clearStoredTokens() {
  localStorage.removeItem('lovetta-token')
  localStorage.removeItem('lovetta-refresh-token')
}

function redirectToLogin() {
  if (window.location.pathname !== LOGIN_PATH) {
    window.location.href = LOGIN_PATH
  }
}

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

// Request interceptor — attach Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lovetta-token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — auto-refresh on 401
let isRefreshing = false
let refreshPromise = null

export async function refreshAccessToken() {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('lovetta-refresh-token')
      if (!refreshToken) return null

      const { data } = await axios.post(
        apiUrl('/api/auth/refresh'),
        { refreshToken },
        { withCredentials: true }
      )

      if (!data?.accessToken) return null

      localStorage.setItem('lovetta-token', data.accessToken)
      if (data.refreshToken) {
        localStorage.setItem('lovetta-refresh-token', data.refreshToken)
      }

      return data.accessToken
    } catch {
      clearStoredTokens()
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

function withAuthHeader(headers = {}, token) {
  const nextHeaders = new Headers(headers)
  if (token && !nextHeaders.has('Authorization')) {
    nextHeaders.set('Authorization', `Bearer ${token}`)
  }
  return nextHeaders
}

export async function authFetch(path, init = {}) {
  const url = apiUrl(path)

  async function run(token) {
    return fetch(url, {
      credentials: 'include',
      ...init,
      headers: withAuthHeader(init.headers, token),
    })
  }

  let response = await run(localStorage.getItem('lovetta-token'))

  if (response.status === 401 && !url.includes('/api/auth/')) {
    const newToken = await refreshAccessToken()
    if (!newToken) {
      redirectToLogin()
      return response
    }
    response = await run(newToken)
  }

  return response
}

export async function getResponseErrorMessage(response, fallback = 'Something went wrong') {
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      return data?.error || data?.message || fallback
    }

    const text = await response.text()
    return text || fallback
  } catch {
    return fallback
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // Skip refresh for auth endpoints
      if (originalRequest.url?.includes('/api/auth/')) {
        return Promise.reject(error)
      }

      try {
        const newToken = await refreshAccessToken()
        if (!newToken) {
          clearStoredTokens()
          redirectToLogin()
          return Promise.reject(error)
        }

        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch {
        clearStoredTokens()
        redirectToLogin()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export function getErrorMessage(error) {
  if (error.response?.data?.error) return error.response.data.error
  if (error.message) return error.message
  return 'Something went wrong'
}

export default api
