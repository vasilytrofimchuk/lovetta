import { isIOS } from './platform'

let keyboardOpen = false
let baseHeight = 0

function setViewportHeight() {
  if (typeof window === 'undefined') return
  if (!baseHeight) baseHeight = window.innerHeight

  let height
  if (keyboardOpen && window.visualViewport) {
    // With KeyboardResize.None, visualViewport.height reports the
    // actual visible area above the keyboard — use it directly
    height = window.visualViewport.height
  } else {
    height = baseHeight
  }
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(height)}px`)
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}
  if (!isIOS()) return () => {}

  baseHeight = window.innerHeight
  setViewportHeight()

  const handleViewportChange = () => setViewportHeight()

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
        setViewportHeight()
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardOpen = false
        setKeyboardScrollLock(false)
        setViewportHeight()
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    window.visualViewport?.removeEventListener('resize', handleViewportChange)
    setKeyboardScrollLock(false)
    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
