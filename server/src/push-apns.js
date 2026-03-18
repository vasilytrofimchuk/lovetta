/**
 * APNs push notifications for iOS native app.
 * Uses @parse/node-apn for HTTP/2 APNs delivery.
 * Tries production first, falls back to sandbox for dev tokens.
 */

const { getPool } = require('./db');

let prodProvider = null;
let sandboxProvider = null;

function getTokenConfig() {
  const keyId = (process.env.APNS_KEY_ID || process.env.APPLE_KEY_ID || '').trim();
  const teamId = (process.env.APNS_TEAM_ID || process.env.APPLE_TEAM_ID || '').trim();
  const key = (process.env.APNS_KEY || process.env.APPLE_PRIVATE_KEY || '').trim();
  if (!keyId || !teamId || !key) return null;
  return { key: key.replace(/\\n/g, '\n'), keyId, teamId };
}

function getProvider(production) {
  if (production && prodProvider) return prodProvider;
  if (!production && sandboxProvider) return sandboxProvider;

  const tokenConfig = getTokenConfig();
  if (!tokenConfig) return null;

  const apn = require('@parse/node-apn');
  const provider = new apn.Provider({ token: tokenConfig, production });
  provider.bundleId = (process.env.APNS_BUNDLE_ID || 'ai.lovetta.app').trim();

  if (production) prodProvider = provider;
  else sandboxProvider = provider;
  return provider;
}

function buildNotification({ title, body, data = {} }) {
  const apn = require('@parse/node-apn');
  const notification = new apn.Notification();
  notification.alert = { title, body };
  notification.sound = 'default';
  notification.badge = 1;
  notification.topic = (process.env.APNS_BUNDLE_ID || 'ai.lovetta.app').trim();
  notification.payload = data;
  return notification;
}

/**
 * Send push notification to a specific APNs device token.
 * Tries production APNs first, falls back to sandbox on BadDeviceToken.
 */
async function sendApnsPush(deviceToken, { title, body, data = {} }) {
  const isProd = process.env.NODE_ENV === 'production';
  const provider = getProvider(isProd);
  if (!provider) return;

  const notification = buildNotification({ title, body, data });

  try {
    const result = await provider.send(notification, deviceToken);
    if (result.failed?.length > 0) {
      const reason = result.failed[0].response?.reason;

      // If production fails with BadDeviceToken, try sandbox (dev builds use sandbox tokens)
      if (isProd && reason === 'BadDeviceToken') {
        const sbProvider = getProvider(false);
        if (sbProvider) {
          const sbNotification = buildNotification({ title, body, data });
          const sbResult = await sbProvider.send(sbNotification, deviceToken);
          if (sbResult.failed?.length > 0) {
            const sbReason = sbResult.failed[0].response?.reason;
            console.warn('[apns] Sandbox also failed:', sbReason);
            if (sbReason === 'BadDeviceToken' || sbReason === 'Unregistered') {
              const pool = getPool();
              if (pool) await pool.query('DELETE FROM apns_subscriptions WHERE device_token = $1', [deviceToken]);
            }
          } else {
            console.log('[apns] Sent via sandbox');
          }
          return;
        }
      }

      console.warn('[apns] Push failed:', reason);
      if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
        const pool = getPool();
        if (pool) await pool.query('DELETE FROM apns_subscriptions WHERE device_token = $1', [deviceToken]);
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
  if (!getTokenConfig()) return;

  const { rows } = await pool.query(
    'SELECT device_token FROM apns_subscriptions WHERE user_id = $1',
    [userId]
  );

  for (const row of rows) {
    await sendApnsPush(row.device_token, { title, body, data });
  }
}

module.exports = { sendApnsPush, sendApnsPushToUser };
