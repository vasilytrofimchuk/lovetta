import api from './api'
import { isAppStore } from './platform'
import {
  isProduct,
  getTipOfferings,
  IOS_TIP_PRODUCTS,
  IOS_TIP_PRODUCT_IDS,
  waitForIosTipIntent,
} from './revenuecat'

const PRODUCT_TIMEOUT_MS = 15_000

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export const TIP_AMOUNTS = [
  { amount: 9.99, rcProductId: IOS_TIP_PRODUCTS[999] },
  { amount: 19.99, rcProductId: IOS_TIP_PRODUCTS[1999] },
  { amount: 49.99, rcProductId: IOS_TIP_PRODUCTS[4999] },
  { amount: 99.99, rcProductId: IOS_TIP_PRODUCTS[9999] },
]

export async function getTipAmountsWithPrices() {
  const tipOfferings = await getTipOfferings()
  if (!tipOfferings?.length) return TIP_AMOUNTS
  return TIP_AMOUNTS.map(tip => {
    const offering = tipOfferings.find(t => isProduct(t.productId, tip.rcProductId))
    return offering
      ? { ...tip, priceString: offering.priceString }
      : tip
  })
}

export async function startTipCheckout(amount, companionId, userId) {
  if (isAppStore()) {
    const tip = TIP_AMOUNTS.find((entry) => entry.amount === amount)
    if (!tip) throw new Error('Invalid tip amount')
    if (!userId) throw new Error('Please sign in again before sending a tip.')

    const amountCents = Math.round(amount * 100)
    const { data } = await api.post('/api/billing/ios/tip-intents', {
      productId: tip.rcProductId,
      amount: amountCents,
      companionId,
    })

    const { Purchases, PRODUCT_CATEGORY } = await import('@revenuecat/purchases-capacitor')

    // Try offerings-based purchase first (enables experiments)
    const tipOfferings = await getTipOfferings()
    const offeringPkg = tipOfferings?.find(t => isProduct(t.productId, tip.rcProductId))?.package

    if (offeringPkg) {
      console.log('[billing] tip purchasePackage', { productId: tip.rcProductId })
      await Purchases.purchasePackage({ aPackage: offeringPkg })
    } else {
      // Fallback: fetch products directly by ID
      console.log('[billing] tip fallback getProducts', { productId: tip.rcProductId })
      const primaryResult = await withTimeout(
        Purchases.getProducts({
          productIdentifiers: IOS_TIP_PRODUCT_IDS,
          type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
        }),
        PRODUCT_TIMEOUT_MS,
        'Timed out loading tip products. Please try again in a moment.'
      )

      let products = primaryResult?.products || []

      if (!products.length) {
        const fallbackResult = await withTimeout(
          Purchases.getProducts({ productIdentifiers: IOS_TIP_PRODUCT_IDS }),
          PRODUCT_TIMEOUT_MS,
          'Timed out loading tip products. Please try again in a moment.'
        )
        products = fallbackResult?.products || []
      }

      if (!products.length) {
        throw new Error('The store returned no tip products. Please try again later.')
      }

      const product = products.find((entry) => isProduct(entry.identifier, tip.rcProductId))
      if (!product) {
        throw new Error(`The store did not return the expected tip product: ${tip.rcProductId}`)
      }

      await Purchases.purchaseStoreProduct({ product })
    }
    const synced = await waitForIosTipIntent(data.intentId)
    return { status: 'completed', intentId: data.intentId, tipId: synced.tipId || null, amount }
  }

  // Card checkout is off (2026-11-04): this is sold only in the iOS and Android apps.
  throw new Error('Available in the Lovetta app.')
}
