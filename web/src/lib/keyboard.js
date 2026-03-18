import { isIOS } from './platform'

let baseHeight = 0

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
  applyHeight(baseHeight)

  let handles = []

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', (info) => {
        setKeyboardScrollLock(true)
        applyHeight(baseHeight - (info.keyboardHeight || 0))
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
