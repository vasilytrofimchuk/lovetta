import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import usePwaInstall from './hooks/usePwaInstall'
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
  if (!user) return <Navigate to={isCapacitor() ? '/signup' : '/login'} replace />
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

function AppRoutes() {
  const { loading } = useAuth()
  if (loading) return <Loading />

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={<ProtectedRoute><CompanionList /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute><CompanionCreate /></ProtectedRoute>} />
      <Route path="/chat/:companionId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={isCapacitor() ? '/' : '/my'}>
      <AuthProvider>
        <DesktopShell>
          {/* Push all content below the camera notch / Dynamic Island */}
          <div style={{ paddingTop: isCapacitor() ? 'max(0px, env(safe-area-inset-top))' : undefined }}>
            <AppRoutes />
            <PwaInstallBanner />
          </div>
        </DesktopShell>
      </AuthProvider>
    </BrowserRouter>
  )
}
