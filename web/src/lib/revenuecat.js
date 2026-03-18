/**
 * RevenueCat integration for iOS in-app purchases.
 * Only active inside Capacitor native builds.
 */
import { isCapacitor } from './platform'

let initialized = false

const REVENUECAT_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY || ''

/** Initialize RevenueCat — call once after user authenticates. */
export async function initRevenueCat(userId) {
  if (!isCapacitor() || initialized) return
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY })
    if (userId) {
      await Purchases.logIn({ appUserID: String(userId) })
    }
    initialized = true
  } catch (err) {
    console.error('[revenuecat] init error:', err)
  }
}

/** Get available subscription offerings. */
export async function getOfferings() {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const { offerings } = await Purchases.getOfferings()
  return offerings?.current || null
}

/** Purchase a subscription package. */
export async function purchasePackage(pkg) {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const result = await Purchases.purchasePackage({ aPackage: pkg })
  return result.customerInfo
}

/** Purchase a specific product (for tips / consumables). */
export async function purchaseProduct(productId) {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const result = await Purchases.purchaseStoreProduct({
    product: { identifier: productId },
  })
  return result.customerInfo
}

/** Restore previous purchases (Apple requirement). */
export async function restorePurchases() {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const result = await Purchases.restorePurchases()
  return result.customerInfo
}

/** Get current customer subscription info. */
export async function getCustomerInfo() {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  const result = await Purchases.getCustomerInfo()
  return result.customerInfo
}

/** Check if user has an active "premium" entitlement. */
export async function hasActiveSubscription() {
  try {
    const info = await getCustomerInfo()
    return !!info.entitlements?.active?.premium
  } catch {
    return false
  }
}
