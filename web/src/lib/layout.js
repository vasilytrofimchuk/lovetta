import { isCapacitor } from './platform'

export function getAppPageHeight() {
  return 'var(--app-viewport-height, 100vh)'
}
