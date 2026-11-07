import { isAndroid } from './platform'

// The store pages of this app. The web app works only inside the iOS and Android apps.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6760726614'
export const APP_STORE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'
export const APP_STORE_REVIEW_URL = 'https://apps.apple.com/app/id6760726614?action=write-review'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=ai.lovetta.app'
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=ai.lovetta.app'

/** This app's store page: Google Play inside the Android app, the App Store everywhere else. */
export function storeUrl() {
  return isAndroid() ? PLAY_STORE_URL : APP_STORE_URL
}

/** Where the user manages (cancels) a store subscription. */
export function storeSubscriptionsUrl() {
  return isAndroid() ? PLAY_SUBSCRIPTIONS_URL : APP_STORE_SUBSCRIPTIONS_URL
}

/** Where the user leaves a review. */
export function storeReviewUrl() {
  return isAndroid() ? PLAY_STORE_URL : APP_STORE_REVIEW_URL
}

/** "App Store" or "Google Play", for button text. */
export function storeName() {
  return isAndroid() ? 'Google Play' : 'App Store'
}
