/**
 * Native push notifications via Capacitor (iOS APNs).
 * Used instead of web push when running inside Capacitor.
 */
import { PushNotifications } from '@capacitor/push-notifications'
import api from './api'

/** Request permissions and register for native push. Returns the device token. */
export async function registerNativePush() {
  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') {
    throw new Error('Push notification permission denied')
  }

  // Remove any stale listeners before adding new ones
  await PushNotifications.removeAllListeners()

  // Wait for registration to complete (with timeout)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Push registration timed out'))
    }, 10000)

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
      console.error('[push] Registration error:', err)
      reject(new Error(err.error || 'Push registration failed'))
    })

    PushNotifications.register()
  })
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
