const ONBOARDING_STORAGE_KEY = 'lovetta-onboarding-data'
const LEGACY_STORAGE_KEY = 'lovetta-landing-data'

function normalizeData(data) {
  if (!data || typeof data !== 'object') return null

  const birthMonth = data.birthMonth ? parseInt(data.birthMonth, 10) : null
  const birthYear = data.birthYear ? parseInt(data.birthYear, 10) : null
  const postAuthPath = typeof data.postAuthPath === 'string' && data.postAuthPath.startsWith('/')
    ? data.postAuthPath
    : null

  return {
    birthMonth: Number.isInteger(birthMonth) ? birthMonth : null,
    birthYear: Number.isInteger(birthYear) ? birthYear : null,
    termsAccepted: !!data.termsAccepted,
    privacyAccepted: !!data.privacyAccepted,
    aiConsentAccepted: !!data.aiConsentAccepted,
    postAuthPath,
  }
}

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function readOnboardingData() {
  return normalizeData(readStorage(ONBOARDING_STORAGE_KEY) || readStorage(LEGACY_STORAGE_KEY))
}

export function writeOnboardingData(data) {
  const normalized = normalizeData(data)
  if (!normalized) return

  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(normalized))
  } catch {}
}

export function clearOnboardingData() {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {}
}

export function hasCompleteConsent(data) {
  return !!(
    data?.birthMonth &&
    data?.birthYear &&
    data?.termsAccepted &&
    data?.privacyAccepted &&
    data?.aiConsentAccepted
  )
}

export function getPostAuthPath(data) {
  return data?.postAuthPath || null
}
