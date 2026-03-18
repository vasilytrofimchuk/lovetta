import { isIOS } from './platform'

let baseHeight = 0
// Safe area bottom (home indicator) — keyboardHeight includes it but
// baseHeight (innerHeight) does not, so we must subtract it
let safeAreaBottom = 34

function applyHeight(h) {
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(h)}px`)
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}
  if (!isIOS()) return () => {}

  baseHeight = window.innerHeight
  // Measure safe area bottom from CSS
  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;'
  document.body.appendChild(div)
  const measured = div.offsetHeight
  document.body.removeChild(div)
  if (measured > 0) safeAreaBottom = measured

  applyHeight(baseHeight)

  let handles = []

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', (info) => {
        const kbHeight = (info.keyboardHeight || 0) - safeAreaBottom
        setKeyboardScrollLock(true)
        applyHeight(baseHeight - kbHeight)
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardScrollLock(false)
        applyHeight(baseHeight)
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    setKeyboardScrollLock(false)
    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
