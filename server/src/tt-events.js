// TikTok Events API (server-side)
// Mirrors browser TikTok Pixel events. Dedup via shared event_id.
// No-op when TT_EVENTS_TOKEN is not configured.

const crypto = require('crypto');

const TT_PIXEL_ID_DEFAULT = 'D7BTC2JC77UCDU0QLTUG';
const ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function isConfigured() {
  return Boolean((process.env.TT_EVENTS_TOKEN || '').trim());
}

/**
 * Send a server-side conversion event to TikTok Events API.
 * Failures are logged and swallowed — never throw to callers.
 */
async function sendTtEvent(opts) {
  let {
    eventName,
    eventId,
    email,
    value,
    currency = 'USD',
    eventSourceUrl,
    clientIp,
    userAgent,
    ttp,
    actionSource = 'website',
    contentId,
    contentName,
  } = opts || {};
  if (!isConfigured()) return { skipped: true };
  if (!eventName) return { skipped: true, reason: 'no event name' };

  const FB_TO_TT = { Purchase: 'CompletePayment', Lead: 'SubmitForm' };
  eventName = FB_TO_TT[eventName] || eventName;

  const token = (process.env.TT_EVENTS_TOKEN || '').trim();
  const pixelCode = (process.env.TT_PIXEL_ID || '').trim() || TT_PIXEL_ID_DEFAULT;

  const user = {};
  if (email) user.email = sha256(email);
  if (clientIp) user.ip = clientIp;
  if (userAgent) user.user_agent = userAgent;
  if (ttp) user.ttp = ttp;

  const properties = {};
  if (value != null) {
    properties.value = Number(value);
    properties.currency = currency;
    properties.contents = [{
      content_id: contentId || 'lovetta_purchase',
      content_type: 'product',
      content_name: contentName || 'Lovetta Purchase',
      quantity: 1,
      price: Number(value),
    }];
  }

  const data = {
    event: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    user,
    properties,
    page: eventSourceUrl ? { url: eventSourceUrl } : undefined,
  };

  const body = {
    event_source: actionSource === 'app' ? 'app' : 'web',
    event_source_id: pixelCode,
    data: [data],
  };
  const testCode = (process.env.TT_TEST_EVENT_CODE || '').trim();
  if (testCode) body.test_event_code = testCode;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[tt-events] ${eventName} failed: ${res.status} ${text.slice(0, 200)}`);
      return { ok: false, status: res.status };
    }
    const json = await res.json().catch(() => ({}));
    if (json && json.code && json.code !== 0) {
      console.warn(`[tt-events] ${eventName} api error: ${json.code} ${json.message || ''}`);
      return { ok: false, code: json.code };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[tt-events] ${eventName} error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendTtEvent, isConfigured };
