import { useEffect, useRef, useState } from 'react'
import api, { getErrorMessage } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const GOOGLE_CLIENT_ID = '1007256282722-1n6bdvdcta96jf51bpajod0gjheo31ur.apps.googleusercontent.com'

export default function GoogleSignIn({ onAgeRequired, onError }) {
  const { refreshUser } = useAuth()
  const btnRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Load Google GSI script
    if (window.google?.accounts) {
      initGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => initGoogle()
    document.head.appendChild(script)

    return () => {
      // cleanup not needed — script persists
    }
  }, [])

  function initGoogle() {
    if (!window.google?.accounts) return

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
    })

    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        width: btnRef.current.offsetWidth,
        text: 'continue_with',
        shape: 'pill',
      })
    }

    setLoaded(true)
  }

  async function handleCredentialResponse(response) {
    try {
      const { data } = await api.post('/api/auth/google', {
        credential: response.credential,
      })

      if (data.accessToken) {
        localStorage.setItem('lovetta-token', data.accessToken)
        localStorage.setItem('lovetta-refresh-token', data.refreshToken)
        await refreshUser()
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      if (msg === 'age_required') {
        // New Google user needs age verification — pass credential up
        if (onAgeRequired) onAgeRequired(response.credential)
      } else {
        if (onError) onError(msg)
      }
    }
  }

  return (
    <div>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-brand-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-brand-bg px-3 text-brand-muted">or</span>
        </div>
      </div>
      <div ref={btnRef} className="flex justify-center" style={{ minHeight: 44 }}>
        {!loaded && (
          <button
            type="button"
            disabled
            className="w-full py-3 rounded-full border border-brand-border text-brand-text-secondary text-sm opacity-50"
          >
            Loading Google...
          </button>
        )}
      </div>
    </div>
  )
}
