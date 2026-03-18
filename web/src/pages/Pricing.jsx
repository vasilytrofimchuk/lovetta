import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api, { getErrorMessage } from '../lib/api'
import { isAppStore } from '../lib/platform'
import { Browser } from '@capacitor/browser'
import { isCapacitor } from '../lib/platform'

function openLink(url) {
  if (isCapacitor()) Browser.open({ url, presentationStyle: 'popover' })
  else window.open(url, '_blank')
}

export default function Pricing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(null)
  const [subLoading, setSubLoading] = useState(true)
  const [offerings, setOfferings] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const pendingPlanRef = useRef(null)

  useEffect(() => {
    // Load offerings first for AppStore, then billing status
    const init = async () => {
      if (isAppStore()) {
        try {
          const { getOfferings } = await import('../lib/revenuecat')
          const o = await getOfferings()
          setOfferings(o)
        } catch {}
      }

      try {
        const { data } = await api.get('/api/billing/status')
        setSubscription(data)
        if (!data?.hasSubscription) {
          const plan = localStorage.getItem('lovetta-selected-plan')
          if (plan === 'monthly' || plan === 'yearly') {
            localStorage.removeItem('lovetta-selected-plan')
            pendingPlanRef.current = plan
            setSelectedPlan(plan)
          }
        } else {
          localStorage.removeItem('lovetta-selected-plan')
        }
      } catch {} finally {
        setSubLoading(false)
      }
    }
    init()
  }, [])

  // Auto-trigger purchase once both offerings and pending plan are known
  useEffect(() => {
    if (offerings && pendingPlanRef.current && !subLoading) {
      const plan = pendingPlanRef.current
      pendingPlanRef.current = null
      handleSubscribe(plan)
    }
  }, [offerings, subLoading])

  const handleSubscribe = async (plan) => {
    setLoading(plan)
    try {
      if (isAppStore()) {
        const o = offerings
        if (!o) throw new Error('Offerings not available yet')
        const pkg = plan === 'yearly'
          ? (o.annual || o.availablePackages?.find(p => p.identifier?.includes('year') || p.identifier?.includes('annual')))
          : (o.monthly || o.availablePackages?.find(p => p.identifier?.includes('month')))
        if (!pkg) throw new Error('Package not available')
        const { purchasePackage } = await import('../lib/revenuecat')
        await purchasePackage(pkg)
        const { data } = await api.get('/api/billing/status')
        setSubscription(data)
        if (data?.hasSubscription) navigate('/')
      } else {
        const { data } = await api.post('/api/billing/subscribe', { plan })
        window.location.href = data.url
      }
    } catch (err) {
      if (err?.code === 'PURCHASE_CANCELLED' || err?.userCancelled) return
      alert(getErrorMessage(err))
    } finally {
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    if (isAppStore()) {
      window.location.href = 'https://apps.apple.com/account/subscriptions'
      return
    }
    try {
      const { data } = await api.post('/api/billing/portal')
      window.location.href = data.url
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const { restorePurchases } = await import('../lib/revenuecat')
      await restorePurchases()
      const { data } = await api.get('/api/billing/status')
      setSubscription(data)
      if (data?.hasSubscription) {
        navigate('/')
      } else {
        alert('No previous purchases found.')
      }
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setRestoring(false)
    }
  }

  const isActive = subscription?.hasSubscription

  if (subLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Active subscription screen
  if (isActive) {
    return (
      <div className="min-h-screen bg-brand-bg p-4">
        <div className="max-w-md mx-auto pt-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-bold text-brand-text">Subscription</h1>
            <button onClick={() => navigate('/')} className="text-sm text-brand-muted hover:text-brand-text transition-colors">Back</button>
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
    )
  }

  // AppStore plan selection — landing-page style
  if (isAppStore()) {
    return (
      <div className="bg-brand-bg flex flex-col px-5" style={{
        minHeight: '100vh',
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 20px, 40px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 12px, 24px)',
      }}>
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-brand-text">Start Free Trial</h2>
          <p className="text-brand-text-secondary text-sm mt-1">Meet your AI girlfriend. Cancel anytime.</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`relative rounded-lg p-4 text-center cursor-pointer transition-all border-[1.5px] bg-brand-surface ${
              selectedPlan === 'monthly'
                ? 'border-brand-accent shadow-[0_0_16px_rgba(214,51,108,0.3)]'
                : 'border-brand-border hover:border-brand-muted'
            }`}
          >
            <div className={`w-[18px] h-[18px] rounded-full border-2 mx-auto mb-2 transition-all ${
              selectedPlan === 'monthly'
                ? 'border-brand-accent bg-brand-accent shadow-[inset_0_0_0_3px_#1a1128]'
                : 'border-brand-border'
            }`} />
            <div className="text-[0.75rem] text-brand-muted uppercase tracking-wide font-semibold mb-1">Monthly</div>
            <div className="text-2xl font-extrabold text-brand-text leading-tight">$19.99</div>
            <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per month</div>
          </button>

          <button
            onClick={() => setSelectedPlan('yearly')}
            className={`relative rounded-lg p-4 text-center cursor-pointer transition-all border-[1.5px] bg-brand-surface ${
              selectedPlan === 'yearly'
                ? 'border-brand-accent shadow-[0_0_16px_rgba(214,51,108,0.3)]'
                : 'border-brand-border hover:border-brand-muted'
            }`}
          >
            <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 bg-brand-accent text-white text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
              Best value
            </span>
            <div className={`w-[18px] h-[18px] rounded-full border-2 mx-auto mb-2 transition-all ${
              selectedPlan === 'yearly'
                ? 'border-brand-accent bg-brand-accent shadow-[inset_0_0_0_3px_#1a1128]'
                : 'border-brand-border'
            }`} />
            <div className="text-[0.75rem] text-brand-muted uppercase tracking-wide font-semibold mb-1">Yearly</div>
            <div className="text-2xl font-extrabold text-brand-text leading-tight">$99.99</div>
            <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per year</div>
            <div className="text-[0.7rem] text-green-400 font-semibold mt-1.5">$8.33/mo — save 58%</div>
          </button>
        </div>

        {/* Trial timeline */}
        <div className="flex items-start justify-center mb-4 px-4">
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-accent border-2 border-brand-accent shadow-[0_0_8px_rgba(214,51,108,0.3)] mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Today</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5 whitespace-nowrap">Full access, free</div>
          </div>
          <div className="h-px flex-1 min-w-4 bg-brand-border mt-1" />
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-card border-2 border-brand-muted mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Day 3</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5">Trial ends</div>
          </div>
          <div className="h-px flex-1 min-w-4 bg-brand-border mt-1" />
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-card border-2 border-brand-text-secondary mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Day 4</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5">First charge</div>
          </div>
        </div>

        {/* Features */}
        <ul className="list-none p-0 mb-4 space-y-1.5">
          {['Unlimited messages with your girlfriend', 'Unique personality & memory', 'Voice messages & photos'].map(f => (
            <li key={f} className="flex items-start gap-2 text-[0.82rem] text-brand-text-secondary">
              <span className="text-brand-accent font-bold text-[0.9rem] leading-none mt-px flex-shrink-0">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* Spacer pushes buttons to bottom */}
        <div className="flex-1" />

        {/* Trial note + links */}
        <p className="text-[0.72rem] text-brand-muted text-center leading-snug mb-4">
          3-day free trial, then auto-renews. Cancel anytime — no charge during trial.{' '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/privacy.html')} className="text-brand-accent underline">Privacy Policy</button>
          {' · '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/terms.html')} className="text-brand-accent underline">Terms of Service</button>
        </p>

        <button
          onClick={() => handleSubscribe(selectedPlan)}
          disabled={!!loading}
          className="w-full py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
        >
          {loading ? 'Processing...' : 'Start Free Trial'}
        </button>

        <button
          onClick={handleRestore}
          disabled={restoring}
          className="w-full py-3 text-brand-muted text-sm hover:text-brand-text-secondary transition-colors mt-1"
        >
          {restoring ? 'Restoring...' : 'Restore Purchases'}
        </button>

        <button onClick={() => navigate('/')} className="w-full py-2 text-brand-muted text-sm mt-1">
          Skip for now
        </button>
      </div>
    )
  }

  // Web plan selection
  return (
    <div className="min-h-screen bg-brand-bg p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-brand-text">Subscription</h1>
          <button onClick={() => navigate('/')} className="text-sm text-brand-muted hover:text-brand-text transition-colors">Back</button>
        </div>

        <p className="text-brand-text-secondary text-center mb-6">Start your 3-day free trial. Cancel anytime.</p>

        <div className="space-y-4">
          <div className="bg-brand-card border border-brand-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-brand-text">Monthly</h3>
              <span className="text-brand-accent font-bold text-lg">$19.99/mo</span>
            </div>
            <p className="text-sm text-brand-muted mb-4">Unlimited conversations, images, girlfriends</p>
            <button onClick={() => handleSubscribe('monthly')} disabled={!!loading}
              className="w-full py-2.5 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50">
              {loading === 'monthly' ? 'Redirecting...' : 'Start Free Trial'}
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
              {loading === 'yearly' ? 'Redirecting...' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
