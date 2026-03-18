/**
 * APNs push notifications for iOS native app.
 * Uses @parse/node-apn for HTTP/2 APNs delivery.
 */

const { getPool } = require('./db');

let apnProvider = null;

function getProvider() {
  if (apnProvider) return apnProvider;

  // Reuse Apple Sign In p8 key for APNs (same key works for both)
  const keyId = (process.env.APNS_KEY_ID || process.env.APPLE_KEY_ID || '').trim();
  const teamId = (process.env.APNS_TEAM_ID || process.env.APPLE_TEAM_ID || '').trim();
  const key = (process.env.APNS_KEY || process.env.APPLE_PRIVATE_KEY || '').trim();
  const bundleId = (process.env.APNS_BUNDLE_ID || 'ai.lovetta.app').trim();

  if (!keyId || !teamId || !key) return null;

  const apn = require('@parse/node-apn');
  apnProvider = new apn.Provider({
    token: {
      key: key.replace(/\\n/g, '\n'), // Handle escaped newlines from env
      keyId,
      teamId,
    },
    production: process.env.NODE_ENV === 'production',
  });

  apnProvider.bundleId = bundleId;
  return apnProvider;
}

/**
 * Send push notification to a specific APNs device token.
 */
async function sendApnsPush(deviceToken, { title, body, data = {} }) {
  const provider = getProvider();
  if (!provider) return;

  const apn = require('@parse/node-apn');
  const notification = new apn.Notification();
  notification.alert = { title, body };
  notification.sound = 'default';
  notification.badge = 1;
  notification.topic = provider.bundleId;
  notification.payload = data;

  try {
    const result = await provider.send(notification, deviceToken);
    if (result.failed?.length > 0) {
      const failure = result.failed[0];
      console.warn('[apns] Push failed:', failure.response?.reason || failure.error);
      // Remove invalid tokens
      if (failure.response?.reason === 'BadDeviceToken' || failure.response?.reason === 'Unregistered') {
        const pool = getPool();
        if (pool) {
          await pool.query('DELETE FROM apns_subscriptions WHERE device_token = $1', [deviceToken]);
        }
      }
    }
  } catch (err) {
    console.error('[apns] Send error:', err.message);
  }
}

/**
 * Send push notification to all APNs devices for a user.
 */
async function sendApnsPushToUser(userId, { title, body, data = {} }) {
  const pool = getPool();
  if (!pool) return;
  const provider = getProvider();
  if (!provider) return;

  const { rows } = await pool.query(
    'SELECT device_token FROM apns_subscriptions WHERE user_id = $1',
    [userId]
  );

  for (const row of rows) {
    await sendApnsPush(row.device_token, { title, body, data });
  }
}

module.exports = { sendApnsPush, sendApnsPushToUser };
