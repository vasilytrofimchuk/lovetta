/**
 * Tracking API — visitor tracking for landing pages.
 * Public endpoints (no auth required).
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { geoFromIp } = require('./geo');

const router = Router();

// -- Bot detection ----------------------------------------
const BOT_RE = /bot|crawler|spider|crawling|headless|lighthouse|pingdom|uptimerobot|synthetics|monitoring|preview|fetch|curl|wget|python-|java\/|go-http|axios|node-fetch|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|applebot|bingpreview|googlebot/i;

function isBot(ua) {
  return BOT_RE.test(ua || '');
}

// -- Simple in-memory rate limiter ------------------------
const rateBuckets = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = 30;

function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
}

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.start < cutoff) rateBuckets.delete(ip);
  }
}, 5 * 60_000);

// -- Sanitize helper --------------------------------------
function san(v, max = 200) {
  if (typeof v !== 'string') return null;
  return v.trim().slice(0, max) || null;
}

// -- POST /api/track-visitor ------------------------------
router.post('/track-visitor', rateLimit, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.json({ ok: true });

  try {
    const { sessionId, page, deviceType, screenResolution, language, timezone, referrer,
            utmSource, utmMedium, utmCampaign, gclid } = req.body || {};

    const sid = san(sessionId, 100);
    if (!sid || sid.length < 10) return res.json({ ok: true });

    const ua = req.get('User-Agent') || '';
    if (isBot(ua)) return res.json({ ok: true });

    const { rows: existing } = await pool.query(
      `SELECT country, state, city FROM visitors WHERE session_id = $1`, [sid]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE visitors SET last_activity = NOW(), current_page = COALESCE($2, current_page) WHERE session_id = $1`,
        [sid, san(page)]
      );
      return res.json({ ok: true, country: existing[0].country, city: existing[0].city, state: existing[0].state });
    }

    const ip = req.ip || '';
    const geo = await geoFromIp(ip);

    await pool.query(
      `INSERT INTO visitors (session_id, current_page, language, timezone, device_type, screen_resolution,
                             user_agent, ip_address, country, state, city, utm_source, utm_medium,
                             utm_campaign, gclid, referrer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (session_id) DO NOTHING`,
      [sid, san(page), san(language, 50), san(timezone, 100), san(deviceType, 50),
       san(screenResolution, 30), san(ua, 500), san(ip, 100),
       geo.country || null, geo.state || null, geo.city || null,
       san(utmSource, 100), san(utmMedium, 100), san(utmCampaign, 200),
       san(gclid, 200), san(referrer, 500)]
    );

    res.json({ ok: true, country: geo.country || null, city: geo.city || null, state: geo.state || null });
  } catch (err) {
    console.error('[tracking] track-visitor error:', err.message);
    res.json({ ok: true });
  }
});

module.exports = router;
