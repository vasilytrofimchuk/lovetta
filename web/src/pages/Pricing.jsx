import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api, { getErrorMessage } from '../lib/api'

export default function Pricing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(null)
  const [subLoading, setSubLoading] = useState(true)

  useEffect(() => {
    api.get('/api/billing/status')
      .then(({ data }) => setSubscription(data))
      .catch(() => {})
      .finally(() => setSubLoading(false))
  }, [])

  const handleSubscribe = async (plan) => {
    setLoading(plan)
    try {
      const { data } = await api.post('/api/billing/subscribe', { plan })
      window.location.href = data.url
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    try {
      const { data } = await api.post('/api/billing/portal')
      window.location.href = data.url
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const isActive = subscription?.hasSubscription

  return (
    <div className="min-h-screen bg-brand-bg p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-brand-text">Subscription</h1>
          <button onClick={() => navigate('/')} className="text-sm text-brand-muted hover:text-brand-text transition-colors">
            Back
          </button>
        </div>

        {subLoading ? (
          <div className="text-center py-8 text-brand-muted">Loading...</div>
        ) : isActive ? (
          <div className="bg-brand-card border border-brand-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-brand-success font-semibold">Active</span>
              <span className="text-brand-text-secondary capitalize">{subscription.plan} plan</span>
            </div>
            {subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date() && (
              <p className="text-sm text-brand-muted mb-3">
                Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}
              </p>
            )}
            {subscription.currentPeriodEnd && (
              <p className="text-sm text-brand-muted mb-4">
                {subscription.status === 'canceling' ? 'Ends' : 'Renews'}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <button
              onClick={handlePortal}
              className="w-full py-2.5 rounded-lg border border-brand-border text-brand-text-secondary hover:bg-brand-surface transition-colors text-sm"
            >
              Manage Subscription
            </button>
          </div>
        ) : (
          <>
            <p className="text-brand-text-secondary text-center mb-6">
              Start your 3-day free trial. Cancel anytime.
            </p>

            <div className="space-y-4">
              <div className="bg-brand-card border border-brand-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-brand-text">Monthly</h3>
                  <span className="text-brand-accent font-bold text-lg">$20/mo</span>
                </div>
                <p className="text-sm text-brand-muted mb-4">Unlimited conversations, images, girlfriends</p>
                <button
                  onClick={() => handleSubscribe('monthly')}
                  disabled={!!loading}
                  className="w-full py-2.5 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50"
                >
                  {loading === 'monthly' ? 'Redirecting...' : 'Start Free Trial'}
                </button>
              </div>

              <div className="bg-brand-card border-2 border-brand-accent rounded-xl p-5 relative">
                <span className="absolute -top-3 left-4 bg-brand-accent text-white text-xs font-bold px-3 py-1 rounded-full">
                  SAVE 58%
                </span>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-brand-text">Yearly</h3>
                  <div className="text-right">
                    <span className="text-brand-accent font-bold text-lg">$100/yr</span>
                    <span className="text-brand-muted text-sm ml-2">~$8.33/mo</span>
                  </div>
                </div>
                <p className="text-sm text-brand-muted mb-4">Same features, best value</p>
                <button
                  onClick={() => handleSubscribe('yearly')}
                  disabled={!!loading}
                  className="w-full py-2.5 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50"
                >
                  {loading === 'yearly' ? 'Redirecting...' : 'Start Free Trial'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Tips section */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 text-center text-brand-text">Send a tip</h2>
          <div className="grid grid-cols-4 gap-3">
            {[10, 20, 50, 100].map((amount) => (
              <TipButton key={amount} amount={amount} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TipButton({ amount }) {
  const [loading, setLoading] = useState(false)

  const handleTip = async () => {
    setLoading(true)
    try {
      const { data } = await api.post('/api/billing/tip', { amount: amount * 100 })
      window.location.href = data.url
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleTip}
      disabled={loading}
      className="py-3 rounded-lg border border-brand-border bg-brand-surface text-brand-text hover:bg-brand-card transition-colors disabled:opacity-50 text-sm font-medium"
    >
      ${amount}
    </button>
  )
}
