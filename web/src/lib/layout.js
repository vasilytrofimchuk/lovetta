import { isCapacitor } from './platform'

export function getAppPageHeight(nativePlatform = isCapacitor()) {
  return nativePlatform
    ? 'calc(var(--app-viewport-height, 100vh) - env(safe-area-inset-top, 0px))'
    : 'var(--app-viewport-height, 100vh)'
}
