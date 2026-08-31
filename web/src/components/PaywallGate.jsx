import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import { getAppPageHeight } from '../lib/layout'
import { isCapacitor, isAppStore } from '../lib/platform'
import { syncIosSubscription } from '../lib/revenuecat'
import PlanModal from './PlanModal'

/**
 * Hard paywall gate.
 *
 * Wraps the routes that need an active subscription (home, companion create,
 * chat). When the server says the user has neither a subscription nor any
 * remaining free tier (`freeTierAvailable === false`, i.e. they signed up
 * after `hard_paywall_cutover_at` while the hard paywall is on), the route is
 * replaced by a non-dismissable full-screen PlanModal.
 *
 * Grandfathered users — anyone created before the cutover — get
 * `freeTierAvailable: true` and pass straight through, keeping the legacy
 * free cost caps and the old skippable plan modals.
 *
 * NOTE: /pricing, /profile, /support and /add-email are deliberately NOT
 * wrapped. App Store review rejects paywalls that trap the user with no way
 * to reach support, restore purchases, sign out or delete their account.
 *
 * Fails OPEN: if /api/billing/status errors we render the route rather than
 * locking a paying user out over a transient network failure. The server-side
 * gate in chat-api/companion-api is the real enforcement — this is UX.
 */
export default function PaywallGate({ children }) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const pageHeight = getAppPageHeight(isCapacitor())
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => api.get('/api/billing/status')
    .then(({ data }) => setStatus(data))
    .catch(() => setStatus(null))
    .finally(() => setLoading(false))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/api/billing/status')
        if (cancelled) return
        // Self-heal: if we're about to lock out an App Store user, first ask
        // RevenueCat directly whether they already own a subscription. A
        // webhook that was delayed, dropped, or never sent (routine in the
        // sandbox) must not strand a paying user on the paywall — that is
        // exactly the 2.1(b) rejection of 1.1 build 8.
        if (!data?.hasSubscription && data?.freeTierAvailable === false && isAppStore()) {
          const synced = await syncIosSubscription()
          if (cancelled) return
          setStatus(synced?.hasSubscription ? synced : data)
        } else {
          setStatus(data)
        }
      } catch {
        if (!cancelled) setStatus(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="bg-brand-bg flex items-center justify-center" style={{ height: pageHeight }}>
        <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No status (request failed) → fail open.
  const blocked = !!status && !status.hasSubscription && status.freeTierAvailable === false
  if (!blocked) return children

  const footer = (
    <div className="flex items-center justify-center gap-4 pt-1 text-[0.72rem] text-brand-muted">
      <button type="button" onClick={() => navigate('/support')} className="underline">Support</button>
      <button type="button" onClick={() => navigate('/profile')} className="underline">Account</button>
      <button type="button" onClick={() => logout()} className="underline">Sign out</button>
    </div>
  )

  return (
    <PlanModal
      isOpen
      fullScreen
      dismissible={false}
      footer={footer}
      onSuccess={load}
    />
  )
}
