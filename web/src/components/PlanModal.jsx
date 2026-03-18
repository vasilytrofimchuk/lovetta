import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../lib/api'
import { isAppStore } from '../lib/platform'
import { Browser } from '@capacitor/browser'
import { isCapacitor } from '../lib/platform'

function openLink(url) {
  if (isCapacitor()) Browser.open({ url, presentationStyle: 'popover' })
  else window.open(url, '_blank')
}

/**
 * Universal plan selection modal.
 * Props:
 *   isOpen      — show/hide
 *   onClose     — called when user clicks "Skip for now" (if null, no skip button shown)
 *   onSuccess   — called after successful iOS purchase (web redirects via Stripe)
 *   fullScreen  — when true, renders without overlay wrapper (used by Pricing.jsx as a full page)
 */
export default function PlanModal({ isOpen, onClose, onSuccess, fullScreen = false }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)
  const [offerings, setOfferings] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const pendingPlanRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (!isAppStore()) return
    const load = async () => {
      try {
        const { getOfferings } = await import('../lib/revenuecat')
        const o = await getOfferings()
        setOfferings(o)
      } catch {}
    }
    load()
  }, [isOpen])

  // Auto-trigger purchase if a plan was selected before offerings loaded
  useEffect(() => {
    if (offerings && pendingPlanRef.current) {
      const plan = pendingPlanRef.current
      pendingPlanRef.current = null
      handleSubscribe(plan)
    }
  }, [offerings])

  const handleSubscribe = async (plan) => {
    setLoading(plan)
    try {
      if (isAppStore()) {
        const o = offerings
        if (!o) {
          // Store pending plan and wait for offerings to load
          pendingPlanRef.current = plan
          const { getOfferings } = await import('../lib/revenuecat')
          const loaded = await getOfferings()
          setOfferings(loaded)
          return
        }
        const pkg = plan === 'yearly'
          ? (o.annual || o.availablePackages?.find(p => p.identifier?.includes('year') || p.identifier?.includes('annual')))
          : (o.monthly || o.availablePackages?.find(p => p.identifier?.includes('month')))
        if (!pkg) throw new Error('Package not available')
        const { purchasePackage } = await import('../lib/revenuecat')
        await purchasePackage(pkg)
        onSuccess?.()
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

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const { restorePurchases } = await import('../lib/revenuecat')
      await restorePurchases()
      onSuccess?.()
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setRestoring(false)
    }
  }

  if (!isOpen) return null

  const content = (
    <div className="min-h-screen bg-brand-bg flex flex-col px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-brand-text">Start Free Trial</h2>
        <p className="text-brand-text-secondary text-sm mt-1">Meet your AI girlfriend. Cancel anytime.</p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
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
          <div className="text-3xl font-extrabold text-brand-text leading-tight">$19.99</div>
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
          <div className="text-3xl font-extrabold text-brand-text leading-tight">$99.99</div>
          <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per year</div>
          <div className="text-[0.7rem] text-green-400 font-semibold mt-1.5">$8.33/mo — save 58%</div>
        </button>
      </div>

      {/* Trial timeline */}
      <div className="flex items-start justify-center mb-3 px-4">
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
      <ul className="list-none p-0 mb-3 space-y-1.5">
        {['Unlimited messages with your girlfriend', 'Unique personality & memory', 'Voice messages & photos'].map(f => (
          <li key={f} className="flex items-start gap-2 text-[0.85rem] text-brand-text-secondary">
            <span className="text-brand-accent font-bold text-[0.9rem] leading-none mt-px flex-shrink-0">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA pinned to bottom */}
      <div className="mt-auto">
        {/* Trial note + links */}
        <p className="text-[0.72rem] text-brand-muted text-center leading-snug mb-3">
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

        {isAppStore() && (
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="w-full py-3 text-brand-muted text-sm hover:text-brand-text-secondary transition-colors mt-1"
          >
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </button>
        )}

        {onClose && (
          <button onClick={onClose} className="w-full py-3 text-brand-muted text-sm mt-1">
            Skip for now
          </button>
        )}
      </div>
    </div>
  )

  if (fullScreen) return content

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-md max-h-screen overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-brand-bg">
        {content}
      </div>
    </div>
  )
}
