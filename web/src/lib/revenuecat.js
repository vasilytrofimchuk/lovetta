import api from './api'

const SYNC_TIMEOUT_MS = 45_000
const SYNC_INTERVAL_MS = 1_500

export const IOS_SUBSCRIPTION_PRODUCTS = {
  monthly: 'lovetta_monthly',
  yearly: 'lovetta_yearly',
}

export const IOS_SUBSCRIPTION_PRODUCT_IDS = Object.values(IOS_SUBSCRIPTION_PRODUCTS)

export const IOS_TIP_PRODUCTS = {
  999: 'lovetta_tip_999',
  1999: 'lovetta_tip_1999',
  4999: 'lovetta_tip_4999',
  9999: 'lovetta_tip_9999',
}

export const IOS_TIP_PRODUCT_IDS = Object.values(IOS_TIP_PRODUCTS)

// Fallback prices when offerings API is unavailable
export const FALLBACK_SUBSCRIPTION_PRICES = {
  monthly: { priceString: '$19.99', price: 19.99, productId: 'lovetta_monthly' },
  yearly: { priceString: '$99.99', price: 99.99, productId: 'lovetta_yearly' },
}

export const FALLBACK_TIP_AMOUNTS = [
  { amount: 9.99, priceString: '$9.99', productId: 'lovetta_tip_999' },
  { amount: 19.99, priceString: '$19.99', productId: 'lovetta_tip_1999' },
  { amount: 49.99, priceString: '$49.99', productId: 'lovetta_tip_4999' },
  { amount: 99.99, priceString: '$99.99', productId: 'lovetta_tip_9999' },
]

let _offeringsCache = null

async function fetchOfferings() {
  if (_offeringsCache) return _offeringsCache
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const result = await Purchases.getOfferings()
  _offeringsCache = result
  return result
}

export async function getSubscriptionOfferings() {
  try {
    const result = await fetchOfferings()
    const current = result?.current
    if (!current) return null

    const monthly = current.monthly || current.availablePackages?.find(p => p.packageType === 'MONTHLY')
    const annual = current.annual || current.availablePackages?.find(p => p.packageType === 'ANNUAL')
    if (!monthly && !annual) return null

    const extract = (pkg) => pkg ? {
      package: pkg,
      priceString: pkg.product?.priceString || pkg.product?.price_string,
      price: pkg.product?.price,
      productId: pkg.product?.identifier,
    } : null

    return {
      monthly: extract(monthly),
      yearly: extract(annual),
    }
  } catch (err) {
    console.warn('[revenuecat] getSubscriptionOfferings failed, using fallback', err)
    return null
  }
}

export async function getTipOfferings() {
  try {
    const result = await fetchOfferings()
    const tips = result?.all?.tips
    if (!tips?.availablePackages?.length) return null

    return tips.availablePackages
      .map(pkg => ({
        package: pkg,
        priceString: pkg.product?.priceString || pkg.product?.price_string,
        price: pkg.product?.price,
        productId: pkg.product?.identifier,
        amount: pkg.product?.price,
      }))
      .sort((a, b) => (a.price || 0) - (b.price || 0))
  } catch (err) {
    console.warn('[revenuecat] getTipOfferings failed, using fallback', err)
    return null
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function serializeRevenueCatError(error) {
  const payload = {
    message: error?.message || error?.errorMessage || error?.response?.data?.error || null,
    errorMessage: error?.errorMessage || null,
    code: error?.code ?? null,
    readableErrorCode: error?.readableErrorCode ?? null,
    userCancelled: error?.userCancelled === true ? true : null,
    underlyingMessage: error?.underlyingErrorMessage || error?.underlyingError?.message || null,
    httpStatus: error?.response?.status ?? null,
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== '')
  )
}

export function getRevenueCatErrorMessage(
  error,
  fallback = 'Something went wrong. Please try again.'
) {
  const details = serializeRevenueCatError(error)
  return details.message || details.errorMessage || details.underlyingMessage || fallback
}

export function isRevenueCatCancelError(error) {
  const details = serializeRevenueCatError(error)
  const code = String(details.code || details.readableErrorCode || '').toUpperCase()
  const message = `${details.message || ''} ${details.errorMessage || ''} ${details.underlyingMessage || ''}`.toLowerCase()

  return (
    details.userCancelled === true
    || code === '1'
    || code.includes('PURCHASE_CANCEL')
    || message.includes('cancelled')
    || message.includes('canceled')
  )
}

export async function waitForSubscriptionSync({ timeoutMs = SYNC_TIMEOUT_MS, intervalMs = SYNC_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data } = await api.get('/api/billing/status')
    if (
      data?.paymentProvider === 'revenuecat'
      && ['active', 'canceling', 'trialing'].includes(data?.status)
      && data?.hasSubscription
    ) {
      return data
    }
    await sleep(intervalMs)
  }

  throw new Error('Purchase completed, but billing sync is still pending. Please reopen the app or tap Restore Purchases.')
}

export async function waitForIosTipIntent(intentId, { timeoutMs = SYNC_TIMEOUT_MS, intervalMs = SYNC_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data } = await api.get(`/api/billing/ios/tip-intents/${intentId}`)
    if (data?.status === 'completed' && (!data?.companionId || data?.thankYouReady)) return data
    if (data?.status === 'expired') {
      throw new Error('Tip purchase did not sync in time. Please try again.')
    }
    await sleep(intervalMs)
  }

  throw new Error('Tip purchase completed, but billing sync is still pending. Please try again in a moment.')
}
