import { useAuth } from '../contexts/AuthContext'

export default function Home() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-brand-bg p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/assets/brand/logo.png" alt="Lovetta" className="w-10 h-10 rounded-xl" />
            <h1 className="text-xl font-bold">Lovetta</h1>
          </div>
          <button
            onClick={logout}
            className="text-sm text-brand-muted hover:text-brand-text transition-colors"
          >
            Sign out
          </button>
        </div>

        <div className="bg-brand-card border border-brand-border rounded-xl p-6 text-center">
          <p className="text-brand-text-secondary mb-2">
            Welcome, {user?.display_name || user?.email}
          </p>
          <p className="text-brand-muted text-sm">
            Your companions are coming soon. We're building something special for you.
          </p>
        </div>
      </div>
    </div>
  )
}
