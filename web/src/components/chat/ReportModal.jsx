import { useState } from 'react';
import api from '../../lib/api';

const REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harmful', label: 'Harmful or dangerous content' },
  { value: 'bug', label: 'Bug or unexpected behavior' },
  { value: 'other', label: 'Other' },
];

export default function ReportModal({ companionId, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/chat/${companionId}/report`, {
        reason,
        details: details.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-brand-card border border-brand-border rounded-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <>
            <div className="text-center py-4">
              <div className="text-3xl mb-3">&#10003;</div>
              <h3 className="text-lg font-semibold text-brand-text mb-2">Report Submitted</h3>
              <p className="text-sm text-brand-text-secondary">Thank you. We'll review your report.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full mt-4 py-3 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-brand-text mb-1">Report Content</h3>
            <p className="text-sm text-brand-text-secondary mb-5">
              Help us improve by reporting inappropriate AI responses.
            </p>

            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'border-brand-accent bg-brand-accent/10 text-brand-text'
                      : 'border-brand-border text-brand-text-secondary hover:border-brand-accent/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-brand-accent"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              rows={3}
              className="w-full px-3 py-2 bg-brand-surface border border-brand-border rounded-lg text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none mb-4"
            />

            {error && (
              <div className="text-sm text-brand-error mb-3">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-lg border border-brand-border text-brand-text-secondary hover:bg-brand-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="flex-1 py-3 rounded-lg bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
