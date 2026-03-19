import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import api, { getErrorMessage } from '../lib/api'
import { isAppStore } from '../lib/platform'
import PlanModal from '../components/PlanModal'
import { getAppPageHeight } from '../lib/layout'

export default function Pricing() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const pageHeight = getAppPageHeight()
  const [searchParams] = useSearchParams()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(null)
  const [subLoading, setSubLoading] = useState(true)
  const onboarding = searchParams.get('onboarding') === '1'

  useEffect(() => {
    api.get('/api/billing/status').then(({ data }) => {
      setSubscription(data)
    }).catch(() => {}).finally(() => setSubLoading(false))
  }, [])

  // Web-only subscribe handler (web plan selection buttons)
  const handleSubscribe = async (plan) => {
    setLoading(plan)
    try {
      const { data } = await api.post('/api/billing/subscribe', { plan })
      window.location.href = data.url
    } catch (err) {
      toast(getErrorMessage(err))
    } finally {
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    if (subscription?.paymentProvider === 'revenuecat') {
      window.location.href = 'https://apps.apple.com/account/subscriptions'
      return
    }
    try {
      const { data } = await api.post('/api/billing/portal')
      window.location.href = data.url
    } catch (err) {
      toast(getErrorMessage(err))
    }
  }

  const isActive = subscription?.hasSubscription

  if (subLoading) {
    return (
      <div className="bg-brand-bg flex items-center justify-center" style={{ height: pageHeight }}>
        <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (onboarding) {
    return (
      <div data-testid="onboarding-plan-screen">
        <PlanModal
          isOpen={true}
          onClose={() => {
            localStorage.setItem('lovetta-plan-skipped', '1')
            navigate('/')
          }}
          onSuccess={() => navigate('/')}
          fullScreen
        />
      </div>
    )
  }

  // Active subscription screen
  if (isActive) {
    return (
      <div data-testid="pricing-page" className="bg-brand-bg flex flex-col w-full overflow-hidden" style={{ height: pageHeight }}>
        <div className="app-scroll-region flex-1 min-h-0 overflow-y-auto app-page-gutter py-4">
          <div className="w-full pt-8">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => navigate('/')} className="text-brand-muted hover:text-brand-text transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-brand-text">Subscription</h1>
          </div>
          <div className="bg-brand-card border border-brand-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-green-400 font-semibold">Active</span>
              <span className="text-brand-text-secondary capitalize">{subscription.plan} plan</span>
            </div>
            {subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date() && (
              <p className="text-sm text-brand-muted mb-3">Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}</p>
            )}
            {subscription.currentPeriodEnd && (
              <p className="text-sm text-brand-muted mb-4">
                {subscription.status === 'canceling' ? 'Ends' : 'Renews'}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <button onClick={handlePortal} className="w-full py-2.5 rounded-lg border border-brand-border text-brand-text-secondary hover:bg-brand-surface transition-colors text-sm">
              Manage Subscription
            </button>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // AppStore: use PlanModal in fullScreen mode (same look as before, now powered by PlanModal)
  if (isAppStore()) {
    return (
      <PlanModal
        isOpen={true}
        onClose={() => navigate('/')}
        onSuccess={() => navigate('/')}
        fullScreen
      />
    )
  }

  // Web plan selection
  return (
    <div data-testid="pricing-page" className="bg-brand-bg flex flex-col w-full overflow-hidden" style={{ height: pageHeight }}>
      <div className="app-scroll-region flex-1 min-h-0 overflow-y-auto app-page-gutter py-4">
        <div className="w-full pt-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-brand-text">Subscription</h1>
          <button onClick={() => navigate('/')} className="text-sm text-brand-muted hover:text-brand-text transition-colors">Back</button>
        </div>

        <p className="text-brand-text-secondary text-center mb-6">3 days free, then auto-renews. Cancel anytime.</p>

        <div className="space-y-4">
          <div className="bg-brand-card border border-brand-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-brand-text">Monthly</h3>
              <span className="text-brand-accent font-bold text-lg">$19.99/mo</span>
            </div>
            <p className="text-sm text-brand-muted mb-4">Unlimited conversations, images, girlfriends</p>
            <button onClick={() => handleSubscribe('monthly')} disabled={!!loading}
              className="w-full py-2.5 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50">
              {loading === 'monthly' ? 'Redirecting...' : '3 Days Free · Then $19.99/mo'}
            </button>
          </div>

          <div className="bg-brand-card border-2 border-brand-accent rounded-xl p-5 relative">
            <span className="absolute -top-3 left-4 bg-brand-accent text-white text-xs font-bold px-3 py-1 rounded-full">SAVE 58%</span>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-brand-text">Yearly</h3>
              <div className="text-right">
                <span className="text-brand-accent font-bold text-lg">$99.99/yr</span>
                <span className="text-brand-muted text-sm ml-2">~$8.33/mo</span>
              </div>
            </div>
            <p className="text-sm text-brand-muted mb-4">Same features, best value</p>
            <button onClick={() => handleSubscribe('yearly')} disabled={!!loading}
              className="w-full py-2.5 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50">
              {loading === 'yearly' ? 'Redirecting...' : '3 Days Free · Then $99.99/yr'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
