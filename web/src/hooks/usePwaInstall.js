import { useState, useEffect } from 'react'

let deferredPrompt = null

// Capture the event globally (fires before React mounts)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
  })
}

export default function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(!!deferredPrompt)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('lovetta-pwa-dismissed') === '1'
  )

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      deferredPrompt = e
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Also hide if already in standalone mode
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone)

  const showPrompt = canInstall && !dismissed && !isStandalone

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    setCanInstall(false)
    return outcome // 'accepted' or 'dismissed'
  }

  function dismiss() {
    setDismissed(true)
    localStorage.setItem('lovetta-pwa-dismissed', '1')
  }

  return { showPrompt, install, dismiss }
}
