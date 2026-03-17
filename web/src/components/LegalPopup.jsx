import { useState } from 'react'
import { Browser } from '@capacitor/browser'
import { isCapacitor } from '../lib/platform'

function openLink(url) {
  if (isCapacitor()) Browser.open({ url: `https://lovetta.ai${url}`, presentationStyle: 'popover' })
  else window.open(url, '_blank')
}

export default function LegalPopup({ onAccept, onClose }) {
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [aiConsent, setAiConsent] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-card border border-brand-border rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Before we continue</h3>
        <p className="text-sm text-brand-text-secondary mb-6">
          Please review and accept our policies to create your account.
        </p>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0"
          />
          <span className="text-sm text-brand-text-secondary">
            I agree to the{' '}
            <button type="button" onClick={() => openLink('/terms.html')} className="text-brand-accent hover:underline">Terms of Service</button>
          </span>
        </label>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={privacy}
            onChange={(e) => setPrivacy(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0"
          />
          <span className="text-sm text-brand-text-secondary">
            I agree to the{' '}
            <button type="button" onClick={() => openLink('/privacy.html')} className="text-brand-accent hover:underline">Privacy Policy</button>
          </span>
        </label>

        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={aiConsent}
            onChange={(e) => setAiConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-brand-accent flex-shrink-0"
          />
          <span className="text-sm text-brand-text-secondary">
            I understand my messages are processed by third-party AI services to generate responses
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-lg border border-brand-border text-brand-text-secondary hover:bg-brand-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onAccept({ termsAccepted: true, privacyAccepted: true, aiConsentAccepted: true })}
            disabled={!terms || !privacy || !aiConsent}
            className="flex-1 py-3 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
