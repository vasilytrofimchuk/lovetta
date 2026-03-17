/**
 * Redis (Heroku Key-Value Store) client singleton.
 * Connects to REDIS_URL env var. Graceful fallback: returns null if unavailable.
 */

const Redis = require('ioredis');

let client = null;
let failed = false;

function getRedis() {
  if (client) return client;
  if (failed) return null;

  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!url) {
    console.warn('[redis] No REDIS_URL configured — Redis features disabled');
    failed = true;
    return null;
  }

  try {
    client = new Redis(url, {
      tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });

    client.on('error', (err) => {
      console.error('[redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('[redis] Connected');
    });

    return client;
  } catch (err) {
    console.error('[redis] Failed to create client:', err.message);
    failed = true;
    return null;
  }
}

module.exports = { getRedis };
