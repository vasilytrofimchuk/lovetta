/**
 * Popup shown when a message is refused for billing reasons.
 * Displayed before the PlanModal (subscription screen).
 *
 * `reason` is the wire code from the chat stream (see lib/paywall.js). Copy
 * differs per code — the old single message claimed "free messages reset
 * every week", which is false for the daily and lifetime caps.
 */
const COPY = {
  subscription_required: {
    title: 'Subscribe to keep chatting',
    body: 'Lovetta is subscription-only. Subscribe for unlimited conversations with your girlfriend.',
  },
  trial_exhausted: {
    title: "You've used up your free messages",
    body: 'Your free access has run out. Subscribe for unlimited conversations with your girlfriend.',
  },
  free_limit_reached: {
    title: "You've used your free messages for this week",
    body: 'Free messages reset every week. Upgrade to Premium for unlimited conversations with your girlfriend.',
  },
}

export default function FreeLimitPopup({ isOpen, reason, onUpgrade, onClose }) {
  if (!isOpen) return null

  const { title, body } = COPY[reason] || COPY.free_limit_reached

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-brand-surface border border-brand-border p-6 text-center shadow-xl">
        <div className="text-4xl mb-3">✨</div>
        <h2 className="text-lg font-bold text-brand-text">
          {title}
        </h2>
        <p className="text-brand-text-secondary text-sm mt-2 leading-relaxed">
          {body}
        </p>

        <button
          onClick={onUpgrade}
          className="w-full mt-5 py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors"
        >
          See Premium Plans
        </button>

        <button
          onClick={onClose}
          className="w-full mt-2 py-3 text-brand-muted text-sm"
        >
          Maybe Later
        </button>
      </div>
    </div>
  )
}
