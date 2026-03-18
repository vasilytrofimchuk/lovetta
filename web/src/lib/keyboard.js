import { isIOS } from './platform'

let currentKeyboardHeight = 0

function setViewportHeight() {
  if (typeof window === 'undefined') return
  const fullHeight = window.innerHeight
  const availableHeight = fullHeight - currentKeyboardHeight
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(availableHeight)}px`)
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}
  if (!isIOS()) return () => {}

  setViewportHeight()

  window.addEventListener('resize', setViewportHeight)

  let handles = []

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.None })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', (info) => {
        currentKeyboardHeight = info.keyboardHeight || 0
        setKeyboardScrollLock(true)
        setViewportHeight()
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        currentKeyboardHeight = 0
        setKeyboardScrollLock(false)
        setViewportHeight()
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    window.removeEventListener('resize', setViewportHeight)
    setKeyboardScrollLock(false)
    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
