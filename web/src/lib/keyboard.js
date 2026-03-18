import { isIOS } from './platform'

let keyboardOpen = false
let baseHeight = 0
let rafId = 0

function applyHeight(h) {
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(h)}px`)
}

function setViewportHeight() {
  if (typeof window === 'undefined') return
  if (!baseHeight) baseHeight = window.innerHeight

  if (!keyboardOpen) {
    applyHeight(baseHeight)
    return
  }

  // When keyboard is open, wait for animation to settle before applying
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    if (window.visualViewport) {
      applyHeight(window.visualViewport.height)
    }
  })
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}
  if (!isIOS()) return () => {}

  baseHeight = window.innerHeight
  applyHeight(baseHeight)

  const handleViewportChange = () => {
    if (keyboardOpen) setViewportHeight()
  }

  window.visualViewport?.addEventListener('resize', handleViewportChange)

  let handles = []

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', () => {
        keyboardOpen = true
        setKeyboardScrollLock(true)
        // keyboardDidShow fires after animation — apply final height
        if (window.visualViewport) {
          applyHeight(window.visualViewport.height)
        }
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardOpen = false
        setKeyboardScrollLock(false)
        cancelAnimationFrame(rafId)
        applyHeight(baseHeight)
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    window.visualViewport?.removeEventListener('resize', handleViewportChange)
    setKeyboardScrollLock(false)
    cancelAnimationFrame(rafId)
    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
