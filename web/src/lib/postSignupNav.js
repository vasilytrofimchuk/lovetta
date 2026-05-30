/**
 * Resolve the post-signup destination from a signup/auth API response.
 *
 * Welcome flow B (`welcome_flow_B_skip_create`): when the server auto-
 * provisioned a first companion, send the user straight into that chat
 * with `firstSession=1` so ChatPage can auto-focus + suppress turn-1
 * extras (auto-photo, plan modal).
 *
 * A_control: keep the legacy onboarding path through Pricing.
 */
export function resolvePostSignupPath(signupResponse) {
  const o = signupResponse?.onboarding
  if (o?.variant === 'B_skip_create' && o.companionId) {
    return `/chat/${o.companionId}?firstSession=1`
  }
  return '/pricing?onboarding=1'
}

/**
 * Build the equivalent destination from URL query params (used after
 * OAuth redirect: the Google web callback encodes onboarding fields
 * into `?onboardingVariant=...&onboardingCompanionId=...`).
 */
export function resolvePostOAuthPath(searchParams, fallback = '/') {
  if (!searchParams) return fallback
  const variant = searchParams.get('onboardingVariant')
  const companionId = searchParams.get('onboardingCompanionId')
  if (variant === 'B_skip_create' && companionId) {
    return `/chat/${companionId}?firstSession=1`
  }
  return fallback
}
