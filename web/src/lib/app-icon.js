import { Capacitor, registerPlugin } from '@capacitor/core'

export const APP_ICON_OPTIONS = [
  { id: 'default', label: 'Default', preview: '/my/assets/app-icons/ios/default.png' },
  { id: 'black', label: 'Black', preview: '/my/assets/app-icons/ios/black.png' },
  { id: 'silver', label: 'Silver', preview: '/my/assets/app-icons/ios/silver.png' },
]

const APP_ICON_STORAGE_KEY = 'lovetta.appIcon'
const APP_ICON_IDS = new Set(APP_ICON_OPTIONS.map((option) => option.id))

function normalizeAppIcon(icon) {
  return APP_ICON_IDS.has(icon) ? icon : 'default'
}

function getNativeAppIcon() {
  return registerPlugin('AppIcon')
}

export function isAppIconPluginAvailable() {
  return !!Capacitor?.isPluginAvailable?.('AppIcon')
}

export function getSavedAppIcon() {
  if (typeof window === 'undefined') return 'default'
  try {
    return normalizeAppIcon(window.localStorage.getItem(APP_ICON_STORAGE_KEY))
  } catch {
    return 'default'
  }
}

export function saveAppIcon(icon) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_ICON_STORAGE_KEY, normalizeAppIcon(icon))
  } catch {}
}

export async function getCurrentAppIcon() {
  return getNativeAppIcon().getCurrentIcon()
}

export async function setCurrentAppIcon(icon) {
  return getNativeAppIcon().setIcon({ icon })
}
