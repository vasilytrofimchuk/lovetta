/**
 * Wire codes the chat SSE stream sends when a message is refused for billing
 * reasons. They all mean "show the paywall", they differ only in copy:
 *   subscription_required — hard paywall, no free tier at all
 *   trial_exhausted       — grandfathered user past their daily/lifetime cost cap
 *   free_limit_reached    — grandfathered user past the weekly cost threshold
 *
 * Kept in one place because these were previously matched by hand in two
 * files and `trial_exhausted` was missed in both, so the strongest block
 * fell through to a generic "she's a bit overwhelmed" toast instead of
 * converting.
 */
export const PAYWALL_ERROR_CODES = ['subscription_required', 'trial_exhausted', 'free_limit_reached']

export function isPaywallError(code) {
  return PAYWALL_ERROR_CODES.includes(code)
}
