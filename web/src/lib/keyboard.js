import { isIOS } from './platform'

let keyboardVisible = false

function setViewportHeight() {
  if (typeof window === 'undefined') return

  let nextHeight = window.visualViewport?.height ?? window.innerHeight
  // When keyboard is open, visualViewport doesn't account for the
  // autocomplete/prediction bar — subtract extra so input bars clear it
  if (keyboardVisible && nextHeight < window.innerHeight) {
    nextHeight -= 44
  }
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
        keyboardVisible = true
        setKeyboardScrollLock(true)
        handleViewportChange()
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardVisible = false
        setKeyboardScrollLock(false)
        handleViewportChange()
        // Reset viewport offset after keyboard animation completes
        // to prevent header from shifting down
        setTimeout(() => {
          window.scrollTo(0, 0)
          document.scrollingElement?.scrollTo(0, 0)
          handleViewportChange()
        }, 100)
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
