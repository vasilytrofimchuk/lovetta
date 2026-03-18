import { isIOS } from './platform'

let keyboardOpen = false

function setViewportHeight() {
  if (typeof window === 'undefined') return

  let nextHeight = window.visualViewport?.height ?? window.innerHeight
  // When keyboard is open, visualViewport doesn't always account for the
  // autocomplete/prediction bar. Subtract extra padding so input bars
  // aren't partially covered.
  if (keyboardOpen && nextHeight < window.innerHeight) {
    nextHeight -= 4
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
    const { Keyboard, KeyboardResize } = keyboardModule

    await Keyboard.setResizeMode({ mode: KeyboardResize.Body })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', () => {
        keyboardOpen = true
        setKeyboardScrollLock(true)
        handleViewportChange()
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardOpen = false
        setKeyboardScrollLock(false)
        handleViewportChange()
        window.requestAnimationFrame(() => {
          window.scrollTo(0, 0)
          document.scrollingElement?.scrollTo(0, 0)
        })
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
