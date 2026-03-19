import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import api, { getErrorMessage } from '../lib/api'
import { isAppStore } from '../lib/platform'
import { Browser } from '@capacitor/browser'
import { isCapacitor } from '../lib/platform'
import { getAppPageHeight } from '../lib/layout'
import {
  getRevenueCatErrorMessage,
  getSubscriptionOfferings,
  FALLBACK_SUBSCRIPTION_PRICES,
  IOS_SUBSCRIPTION_PRODUCT_IDS,
  IOS_SUBSCRIPTION_PRODUCTS,
  isRevenueCatCancelError,
  serializeRevenueCatError,
  waitForSubscriptionSync,
} from '../lib/revenuecat'

const IOS_PURCHASE_ERROR_MESSAGE = 'Unable to start the iOS subscription. If using Xcode, select Lovetta.storekit in the App scheme. If using Apple sandbox, verify the sandbox Apple account, agreements, and product status in App Store Connect.'
const PRODUCT_TIMEOUT_MS = 15_000

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

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
  const pageHeight = getAppPageHeight()
  const { user } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [error, setError] = useState('')
  const [loadingMessage, setLoadingMessage] = useState('')
  const [offerings, setOfferings] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setLoadingMessage('')
    if (isAppStore()) {
      getSubscriptionOfferings().then(setOfferings).catch(() => {})
    }
  }, [isOpen])

  const sub = (plan) => offerings?.[plan] || FALLBACK_SUBSCRIPTION_PRICES[plan]
  const monthlyPrice = sub('monthly')?.price || 19.99
  const yearlyPrice = sub('yearly')?.price || 99.99
  const yearlyPerMonth = (yearlyPrice / 12).toFixed(2)
  const savingsPercent = Math.round((1 - yearlyPrice / 12 / monthlyPrice) * 100)

  const handleSubscribe = async (plan) => {
    setError('')
    setLoading(plan)
    setLoadingMessage('Loading subscription…')
    try {
      if (isAppStore()) {
        if (!user?.id) {
          throw new Error('Please sign in again before starting a subscription.')
        }

        const { Purchases } = await import('@revenuecat/purchases-capacitor')
        const offeringPkg = offerings?.[plan]?.package

        console.log('[billing] subscribe tapped', {
          plan,
          useOffering: !!offeringPkg,
        })

        setLoadingMessage('Opening App Store…')

        if (offeringPkg) {
          // Use offerings-based purchase (enables experiments/A/B tests)
          console.log('[billing] purchasePackage', { plan, productId: offeringPkg.product?.identifier })
          await Purchases.purchasePackage({ aPackage: offeringPkg })
        } else {
          // Fallback: fetch products directly by ID
          const productIdentifier = IOS_SUBSCRIPTION_PRODUCTS[plan]
          console.log('[billing] fallback getProducts', { plan, productIdentifier })
          const productsResult = await withTimeout(
            Purchases.getProducts({ productIdentifiers: IOS_SUBSCRIPTION_PRODUCT_IDS }),
            PRODUCT_TIMEOUT_MS,
            IOS_PURCHASE_ERROR_MESSAGE
          )
          const products = productsResult?.products || []
          if (!products.length) {
            throw new Error('No iOS subscription products were returned. If using Xcode, select Lovetta.storekit in the App scheme. If using Apple sandbox, verify the sandbox Apple account and product status in App Store Connect.')
          }
          const product = products.find((entry) => entry.identifier === productIdentifier)
          if (!product) {
            throw new Error(`StoreKit did not return the expected subscription product: ${productIdentifier}`)
          }
          await Purchases.purchaseStoreProduct({ product })
        }
        console.log('[billing] purchase resolved', { plan })

        setLoadingMessage('Syncing subscription…')
        const synced = await waitForSubscriptionSync()
        onSuccess?.(synced)
      } else {
        const { data } = await api.post('/api/billing/subscribe', { plan })
        window.location.href = data.url
      }
    } catch (err) {
      if (isAppStore()) {
        if (isRevenueCatCancelError(err)) return
        const message = getRevenueCatErrorMessage(err, IOS_PURCHASE_ERROR_MESSAGE)
        console.error('[billing] subscribe failed', serializeRevenueCatError(err))
        setError(message)
        return
      }

      const message = getErrorMessage(err)
      console.error('[billing] subscribe failed', err)
      setError(message)
      toast(message)
    } finally {
      setLoading(null)
      setLoadingMessage('')
    }
  }

  const handleRestore = async () => {
    setError('')
    setRestoring(true)
    setLoadingMessage('Restoring purchases…')
    try {
      if (isAppStore()) {
        if (!user?.id) {
          throw new Error('Please sign in again before restoring purchases.')
        }

        const { Purchases } = await import('@revenuecat/purchases-capacitor')
        await Purchases.restorePurchases()
      }
      setLoadingMessage('Syncing subscription…')
      const synced = await waitForSubscriptionSync()
      onSuccess?.(synced)
    } catch (err) {
      const message = isAppStore()
        ? getRevenueCatErrorMessage(
          err,
          'Restore is taking too long. If using Xcode, confirm Lovetta.storekit is selected. If using Apple sandbox, verify the sandbox Apple account and product setup.'
        )
        : getErrorMessage(err)
      console.error('[billing] restore failed', isAppStore() ? serializeRevenueCatError(err) : err)
      setError(message)
      if (!isAppStore()) toast(message)
    } finally {
      setRestoring(false)
      setLoadingMessage('')
    }
  }

  if (!isOpen) return null

  const safeTop = fullScreen ? 'pt-8' : 'pt-[max(2.5rem,env(safe-area-inset-top,2.5rem))]'

  const content = (
    <div className={`flex-1 flex flex-col justify-center px-5 md:px-6 lg:px-8 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] ${safeTop}`}>
      <div className="text-center mb-5">
        <h2 className="text-xl font-bold text-brand-text">Meet Her for Free</h2>
        <p className="text-brand-text-secondary text-sm mt-1">Meet your AI girlfriend. Cancel anytime.</p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-2.5 mb-5">
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
          <div className="text-3xl font-extrabold text-brand-text leading-tight">{sub('monthly')?.priceString || '$19.99'}</div>
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
          <div className="text-3xl font-extrabold text-brand-text leading-tight">{sub('yearly')?.priceString || '$99.99'}</div>
          <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per year</div>
          <div className="text-[0.7rem] text-green-400 font-semibold mt-1.5">${yearlyPerMonth}/mo — save {savingsPercent}%</div>
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

      <div className="pt-3">
        {/* Trial note + links */}
        <p className="text-[0.72rem] text-brand-muted text-center leading-snug mb-5">
          3-day free trial, then auto-renews. Cancel anytime — no charge during trial.{' '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/privacy.html')} className="text-brand-accent underline">Privacy Policy</button>
          {' · '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/terms.html')} className="text-brand-accent underline">Terms of Service</button>
        </p>

        <div className="space-y-5">
          <button
            onClick={() => handleSubscribe(selectedPlan)}
            disabled={!!loading}
            className="w-full py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
          >
            {loading ? (loadingMessage || 'Processing...') : `3 Days Free · Then ${sub(selectedPlan)?.priceString || (selectedPlan === 'yearly' ? '$99.99' : '$19.99')}/${selectedPlan === 'yearly' ? 'yr' : 'mo'}`}
          </button>

          {isAppStore() && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="w-full py-3 text-brand-muted text-sm hover:text-brand-text-secondary transition-colors"
            >
              {restoring ? 'Restoring...' : 'Restore Purchases'}
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {onClose && (
            <button onClick={onClose} className="w-full py-3 text-brand-muted text-sm">
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )

  if (fullScreen) return (
    <div className="bg-brand-bg" style={{ height: pageHeight }}>
      <div className="app-scroll-region h-full overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {content}
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-brand-bg">
      <div className="app-shell-width h-full bg-brand-bg flex flex-col">
        {content}
      </div>
    </div>
  )
}
