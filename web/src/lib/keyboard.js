import { isIOS } from './platform'

function setViewportHeight() {
  if (typeof window === 'undefined') return

  const nextHeight = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(nextHeight)}px`)
}

function setKeyboardScrollLock(isLocked) {
  document.documentElement.classList.toggle('ios-keyboard-open', isLocked)
  document.body.classList.toggle('ios-keyboard-open', isLocked)
}

export async function initIosKeyboard() {
  if (typeof window === 'undefined') return () => {}

  if (!isIOS()) {
    return () => {}
  }

  setViewportHeight()

  const handleViewportChange = () => {
    setViewportHeight()
  }

  window.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('scroll', handleViewportChange)

  let handles = []

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    const { Keyboard, KeyboardResize, KeyboardStyle } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.Body })
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', () => {
        setKeyboardScrollLock(true)
        handleViewportChange()
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardScrollLock(false)
        handleViewportChange()
      }),
    ])
  } catch (error) {
    console.error('[ios-keyboard]', error)
  }

  return () => {
    window.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener('scroll', handleViewportChange)

    setKeyboardScrollLock(false)

    handles.forEach((handle) => handle?.remove?.())
    handles = []
  }
}
