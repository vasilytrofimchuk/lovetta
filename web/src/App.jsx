import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
  if (!user) return <Navigate to="/login" replace />
  return children
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
    <BrowserRouter basename="/my">
      <AuthProvider>
        <DesktopShell>
          <AppRoutes />
        </DesktopShell>
      </AuthProvider>
    </BrowserRouter>
  )
}
