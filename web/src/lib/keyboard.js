import { isIOS } from './platform'

let baseHeight = 0
let safeAreaBottom = 0
let keyboardOpen = false
let safeAreaProbe = null

function applyHeight(h) {
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(h)}px`)
}

function applyKeyboardOffset(h) {
  document.documentElement.style.setProperty('--app-keyboard-offset', `${Math.max(0, Math.round(h))}px`)
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

function getSafeAreaProbe() {
  if (typeof document === 'undefined') return null
  if (safeAreaProbe) return safeAreaProbe

  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.position = 'fixed'
  probe.style.left = '0'
  probe.style.right = '0'
  probe.style.bottom = '0'
  probe.style.height = '0'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
  document.body.appendChild(probe)
  safeAreaProbe = probe
  return safeAreaProbe
}

function measureSafeAreaBottom() {
  const probe = getSafeAreaProbe()
  if (!probe || typeof window === 'undefined') return 0
  return parseFloat(window.getComputedStyle(probe).paddingBottom) || 0
}

function updateBaseMetrics() {
  if (typeof window === 'undefined' || keyboardOpen) return
  baseHeight = window.innerHeight
  safeAreaBottom = measureSafeAreaBottom()
  applyHeight(baseHeight)
  applyKeyboardOffset(0)
}

async function setNativeScrollLock(Keyboard, isLocked) {
  try {
    await Keyboard.setScroll({ isDisabled: isLocked })
  } catch (error) {
    console.error('[ios-keyboard] setScroll failed', error)
  }
}

function setKeyboardState(Keyboard, isOpen, keyboardHeight = 0) {
  keyboardOpen = isOpen
  setKeyboardScrollLock(isOpen)
  void setNativeScrollLock(Keyboard, isOpen)

  if (isOpen) {
    const nextOffset = Math.max(0, (keyboardHeight || 0) - safeAreaBottom)
    applyKeyboardOffset(nextOffset)
    return
  }

  applyKeyboardOffset(0)
  updateBaseMetrics()
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}
  if (!isIOS()) return () => {}

  updateBaseMetrics()

  let handles = []
  let keyboardApi = null
  const handleResize = () => {
    if (!keyboardOpen) {
      updateBaseMetrics()
    }
  }

  window.addEventListener('resize', handleResize, { passive: true })

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule
    keyboardApi = Keyboard

    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardWillShow', (info) => {
        setKeyboardState(Keyboard, true, info.keyboardHeight || 0)
      }),
      Keyboard.addListener('keyboardDidShow', (info) => {
        setKeyboardState(Keyboard, true, info.keyboardHeight || 0)
      }),
      Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardState(Keyboard, false)
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardState(Keyboard, false)
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    keyboardOpen = false
    window.removeEventListener('resize', handleResize)
    setKeyboardScrollLock(false)
    applyKeyboardOffset(0)
    updateBaseMetrics()
    if (keyboardApi) {
      void setNativeScrollLock(keyboardApi, false)
    }
    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
