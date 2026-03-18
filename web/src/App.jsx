import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/Toast'
import usePwaInstall from './hooks/usePwaInstall'
import { initIosKeyboard } from './lib/keyboard'
import { isCapacitor } from './lib/platform'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import CompanionList from './pages/CompanionList'
import CompanionCreate from './pages/CompanionCreate'
import ChatPage from './pages/ChatPage'
import Pricing from './pages/Pricing'
import Profile from './pages/Profile'
import SupportPage from './pages/SupportPage'
import WelcomeScreen from './pages/WelcomeScreen'
import DesktopShell from './components/DesktopShell'

function Loading() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user) return <Navigate to="/" replace />
  return children
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to={isCapacitor() ? '/welcome' : '/login'} replace />
  return children
}

function PwaInstallBanner() {
  const { user } = useAuth()
  const { showPrompt, install, dismiss } = usePwaInstall()
  const isTelegram = !!window.Telegram?.WebApp?.initData

  if (!user || !showPrompt || isTelegram || isCapacitor()) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-brand-card border border-brand-border rounded-2xl p-4 shadow-lg flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-brand-text text-sm font-medium">Install Lovetta</p>
        <p className="text-brand-text-secondary text-xs">Add to home screen for the best experience</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 text-brand-muted hover:text-brand-text-secondary text-lg leading-none transition-colors"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}

function RevenueCatInitializer() {
  const { user } = useAuth()
  const initStateRef = useRef({
    configured: false,
    promise: null,
  })

  useEffect(() => {
    if (!isCapacitor()) return

    let cancelled = false

    const initRevenueCat = async () => {
      const rcKey = import.meta.env.VITE_REVENUECAT_IOS_KEY
      if (!rcKey) {
        console.error('VITE_REVENUECAT_IOS_KEY not configured — skipping RevenueCat init')
        return
      }

      if (initStateRef.current.promise) {
        await initStateRef.current.promise
      }

      const run = (async () => {
        const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor')
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })

        if (!initStateRef.current.configured) {
          console.log('[billing] configuring RevenueCat SDK')
          await Purchases.configure({ apiKey: rcKey })
          initStateRef.current.configured = true
        }

        if (user?.id) {
          await Purchases.logIn({ appUserID: String(user.id) })
        }

        console.log('[revenuecat] initialized', { userId: user?.id || null })
      })()

      initStateRef.current.promise = run

      try {
        await run
      } finally {
        if (initStateRef.current.promise === run) {
          initStateRef.current.promise = null
        }
      }
    }

    initRevenueCat().catch((error) => {
      if (cancelled) return
      console.error('[billing] failed to initialize RevenueCat', error)
    })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  return null
}

function AppRoutes() {
  const { loading } = useAuth()
  if (loading) return <Loading />

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/welcome" element={<PublicRoute><WelcomeScreen /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={<ProtectedRoute><CompanionList /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute><CompanionCreate /></ProtectedRoute>} />
      <Route path="/chat/:companionId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  useEffect(() => {
    let dispose = () => {}
    let active = true

    initIosKeyboard().then((cleanup) => {
      if (!active) {
        cleanup?.()
        return
      }
      if (typeof cleanup === 'function') dispose = cleanup
    })

    return () => {
      active = false
      dispose()
    }
  }, [])

  return (
    <BrowserRouter basename={isCapacitor() ? '/' : '/my'}>
      <AuthProvider>
        <ToastProvider>
          <RevenueCatInitializer />
          <DesktopShell>
            {/* Push all content below the camera notch / Dynamic Island */}
            <div style={{ paddingTop: isCapacitor() ? 'max(0px, env(safe-area-inset-top))' : undefined }}>
              <AppRoutes />
              <PwaInstallBanner />
            </div>
          </DesktopShell>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
