import axios from 'axios'

const isNative = !!(window.Capacitor?.isNativePlatform?.())
const API_BASE = isNative ? 'https://lovetta.ai' : ''

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
        if (!isRefreshing) {
          isRefreshing = true
          const refreshToken = localStorage.getItem('lovetta-refresh-token')
          refreshPromise = api.post('/api/auth/refresh', { refreshToken })
        }

        const { data } = await refreshPromise
        isRefreshing = false
        refreshPromise = null

        localStorage.setItem('lovetta-token', data.accessToken)
        localStorage.setItem('lovetta-refresh-token', data.refreshToken)

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        return api(originalRequest)
      } catch {
        isRefreshing = false
        refreshPromise = null
        localStorage.removeItem('lovetta-token')
        localStorage.removeItem('lovetta-refresh-token')
        window.location.href = isNative ? '/my/login' : '/my/login'
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
