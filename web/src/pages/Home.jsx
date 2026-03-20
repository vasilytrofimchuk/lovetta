import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import api from '../lib/api'
import { trackPay } from '../lib/pixels'
import Pricing from './Pricing'

export default function Home() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [subscription, setSubscription] = useState(null)
  const [showPricing, setShowPricing] = useState(false)

  useEffect(() => {
    api.get('/api/billing/status').then(({ data }) => setSubscription(data)).catch(() => {})
  }, [])

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    const tip = searchParams.get('tip')
    if (checkout === 'success') { trackPay(); toast('Subscription activated!', { type: 'success' }) }
    if (checkout === 'cancel') toast('Checkout canceled', { type: 'info' })
    // Tip success/cancel handled in ChatPage via server-inserted thank-you message
  }, [searchParams])

  if (showPricing) {
    return <Pricing subscription={subscription} onBack={() => { setShowPricing(false); api.get('/api/billing/status').then(({ data }) => setSubscription(data)).catch(() => {}) }} />
  }

  return (
    <div className="min-h-screen bg-brand-bg app-page-gutter py-4">
      <div className="w-full pt-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/assets/brand/logo_text.png" alt="Lovetta" className="h-8" />
          </div>
          <button
            onClick={logout}
            className="text-sm text-brand-muted hover:text-brand-text transition-colors"
          >
            Sign out
          </button>
        </div>

        <div className="bg-brand-card border border-brand-border rounded-xl p-6 text-center mb-4">
          <p className="text-brand-text-secondary mb-2">
            Welcome, {user?.display_name || user?.email}
          </p>
          <p className="text-brand-muted text-sm">
            Your girlfriends are coming soon. We're building something special for you.
          </p>
        </div>

        {subscription && (
          <div className="bg-brand-card border border-brand-border rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-brand-text-secondary">Subscription</span>
                <p className={`font-semibold ${subscription.hasSubscription ? 'text-brand-success' : 'text-brand-muted'}`}>
                  {subscription.hasSubscription ? `${subscription.plan} — Active` : 'No subscription'}
                </p>
              </div>
              <button
                onClick={() => setShowPricing(true)}
                className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-brand-accent-hover transition-colors"
              >
                {subscription.hasSubscription ? 'Manage' : 'Subscribe'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
