/**
 * Custom popup shown when a free user hits their weekly usage limit.
 * Displayed before the PlanModal (subscription screen).
 */
export default function FreeLimitPopup({ isOpen, onUpgrade, onClose }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-brand-surface border border-brand-border p-6 text-center shadow-xl">
        <div className="text-4xl mb-3">✨</div>
        <h2 className="text-lg font-bold text-brand-text">
          You've used your free messages
        </h2>
        <p className="text-brand-text-secondary text-sm mt-2 leading-relaxed">
          Free messages reset every week. Upgrade to Premium for unlimited conversations with your girlfriend.
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
