import api from './api'
import { isAppStore } from './platform'
import {
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
    const offering = tipOfferings.find(t => t.productId === tip.rcProductId)
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
    console.log('[billing] tipOfferings', tipOfferings?.map(t => ({ productId: t.productId, price: t.price })))
    console.log('[billing] looking for', tip.rcProductId)
    const offeringPkg = tipOfferings?.find(t => t.productId === tip.rcProductId)?.package

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
        'Timed out loading iOS tip products. If using Xcode, select Lovetta.storekit in the App scheme. If using Apple sandbox, verify the sandbox Apple account and App Store Connect setup.'
      )

      let products = primaryResult?.products || []

      if (!products.length) {
        const fallbackResult = await withTimeout(
          Purchases.getProducts({ productIdentifiers: IOS_TIP_PRODUCT_IDS }),
          PRODUCT_TIMEOUT_MS,
          'Timed out loading iOS tip products. If using Xcode, select Lovetta.storekit in the App scheme. If using Apple sandbox, verify the sandbox Apple account and App Store Connect setup.'
        )
        products = fallbackResult?.products || []
      }

      if (!products.length) {
        throw new Error('No iOS tip products were returned. If using Xcode, select Lovetta.storekit in the App scheme. If using Apple sandbox, verify the sandbox Apple account and product status in App Store Connect.')
      }

      const product = products.find((entry) => entry.identifier === tip.rcProductId)
      if (!product) {
        throw new Error(`StoreKit did not return the expected tip product: ${tip.rcProductId}`)
      }

      await Purchases.purchaseStoreProduct({ product })
    }
    const synced = await waitForIosTipIntent(data.intentId)
    return { status: 'completed', intentId: data.intentId, tipId: synced.tipId || null }
  }

  // Stripe checkout for web
  const { data } = await api.post('/api/billing/tip', {
    amount: Math.round(amount * 100),
    companionId,
  })
  window.location.href = data.url
  return { status: 'redirected' }
}
