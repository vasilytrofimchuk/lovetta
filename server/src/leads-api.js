/**
 * Lead capture API — public endpoint for landing page signups.
 */

const { Router } = require('express');
const { getPool } = require('./db');

const router = Router();

// -- Rate limiter (shared pattern) ------------------------
const rateBuckets = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = 10;

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

// -- Validation -------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function san(v, max = 200) {
  if (typeof v !== 'string') return null;
  return v.trim().slice(0, max) || null;
}

function isAtLeast18(birthMonth, birthYear) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const age = currentYear - birthYear - (currentMonth < birthMonth ? 1 : 0);
  return age >= 18;
}

// -- POST /api/leads --------------------------------------
router.post('/leads', rateLimit, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { email, birthMonth, birthYear, sessionId } = req.body || {};

    // Validate email
    const cleanEmail = san(email, 320);
    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Validate birth month/year
    const month = parseInt(birthMonth, 10);
    const year = parseInt(birthYear, 10);
    if (!month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'invalid_birth_month' });
    }
    if (!year || year < 1900 || year > new Date().getFullYear()) {
      return res.status(400).json({ error: 'invalid_birth_year' });
    }

    // Age gate
    if (!isAtLeast18(month, year)) {
      return res.status(403).json({ error: 'age_restricted' });
    }

    // Enrich with visitor data if session exists
    let visitorData = {};
    const sid = san(sessionId, 100);
    if (sid) {
      const { rows } = await pool.query(
        `SELECT referrer, utm_source, utm_medium, utm_campaign, country, city FROM visitors WHERE session_id = $1`,
        [sid]
      );
      if (rows.length > 0) visitorData = rows[0];
    }

    // Insert lead
    await pool.query(
      `INSERT INTO leads (email, birth_month, birth_year, session_id, referrer, utm_source, utm_medium, utm_campaign, country, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cleanEmail.toLowerCase(),
        month,
        year,
        sid,
        visitorData.referrer || null,
        visitorData.utm_source || null,
        visitorData.utm_medium || null,
        visitorData.utm_campaign || null,
        visitorData.country || null,
        visitorData.city || null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[leads] Error:', err.message);
    res.status(500).json({ error: 'internal' });
  }
});

module.exports = router;
