import { isIOS } from './platform'

function setViewportHeight() {
  if (typeof window === 'undefined') return

  const nextHeight = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(nextHeight)}px`)
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
  let Keyboard = null

  try {
    const keyboardModule = await import('@capacitor/keyboard')
    Keyboard = keyboardModule.Keyboard

    await Keyboard.setResizeMode({ mode: keyboardModule.KeyboardResize.Body })
    await Keyboard.setScroll({ isDisabled: true })

    handles = await Promise.all([
      Keyboard.addListener('keyboardDidShow', handleViewportChange),
      Keyboard.addListener('keyboardDidHide', () => {
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

    handles.forEach((handle) => handle?.remove?.())
    handles = []

    if (Keyboard) {
      Keyboard.setScroll({ isDisabled: false }).catch(() => {})
    }
  }
}
