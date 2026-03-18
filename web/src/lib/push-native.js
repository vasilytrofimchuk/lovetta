/**
 * Native push notifications via Capacitor (iOS APNs).
 * Used instead of web push when running inside Capacitor.
 */
import { PushNotifications } from '@capacitor/push-notifications'
import api from './api'

/** Request permissions and register for native push. Returns the device token. */
export async function registerNativePush() {
  // Clear stale listeners first
  await PushNotifications.removeAllListeners()

  // Set up listeners BEFORE requesting permissions (iOS may auto-register on grant)
  const tokenPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Push registration timed out after 15s'))
    }, 15000)

    PushNotifications.addListener('registration', async (token) => {
      clearTimeout(timeout)
      console.log('[push] Got device token:', token.value?.slice(0, 20) + '...')
      try {
        await api.post('/api/user/push/subscribe-apns', { token: token.value })
        resolve(token.value)
      } catch (err) {
        reject(err)
      }
    })

    PushNotifications.addListener('registrationError', (err) => {
      clearTimeout(timeout)
      console.error('[push] Registration error:', JSON.stringify(err))
      reject(new Error(err.error || 'Push registration failed'))
    })
  })

  // Now request permissions
  const permission = await PushNotifications.requestPermissions()
  console.log('[push] Permission result:', permission.receive)
  if (permission.receive !== 'granted') {
    await PushNotifications.removeAllListeners()
    throw new Error('Push notification permission denied')
  }

  // Trigger registration (sends device token to APNs)
  await PushNotifications.register()
  console.log('[push] register() called, waiting for token...')

  return tokenPromise
}

/** Unregister from native push notifications. */
export async function unregisterNativePush() {
  try {
    await api.delete('/api/user/push/unsubscribe-apns')
  } catch {}
}

/** Set up listeners for incoming notifications and taps. */
export function setupPushListeners(navigateFn) {
  // Notification received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[push] Received:', notification)
  })

  // User tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data
    if (data?.url) {
      navigateFn?.(data.url)
    } else if (data?.companionId) {
      navigateFn?.(`/chat/${data.companionId}`)
    }
  })
}
