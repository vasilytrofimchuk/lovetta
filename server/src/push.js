/**
 * Web Push notifications — sends browser push via VAPID/web-push.
 * Graceful no-op if VAPID keys not configured.
 */

const webpush = require('web-push');
const { getPool } = require('./db');

const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_EMAIL = (process.env.VAPID_EMAIL || 'mailto:hello@lovetta.ai').trim();

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('[push] VAPID configured');
} else {
  console.warn('[push] VAPID keys not configured — push notifications disabled');
}

/**
 * Send push notification to all subscriptions for a user.
 * Sends both web push (VAPID) and native iOS push (APNs).
 * Removes expired/invalid subscriptions automatically.
 */
async function sendPushNotification(userId, { title, body, url }) {
  const pool = getPool();
  if (!pool) return;

  // Web push via VAPID
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    const { rows: subs } = await pool.query(
      'SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    const payload = JSON.stringify({ title, body, url });

    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };

      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          console.log(`[push] Removed expired subscription ${sub.id}`);
        } else {
          console.warn(`[push] Failed to send to subscription ${sub.id}:`, err.message);
        }
      }
    }
  }

  // Native iOS push via APNs
  try {
    const { sendApnsPushToUser } = require('./push-apns');
    await sendApnsPushToUser(userId, { title, body, data: { url } });
  } catch (err) {
    // APNs not configured or failed — non-fatal
    if (!err.message?.includes('not configured')) {
      console.warn(`[push] APNs error for user ${userId}:`, err.message);
    }
  }
}

function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

module.exports = { sendPushNotification, getVapidPublicKey };
