/**
 * Auth middleware — JWT authentication for protected routes.
 */

const { verifyAccessToken } = require('./jwt');
const { getPool } = require('./db');
const { logEvent, hasEvent } = require('./events');

// Debounce activity updates per user. Was 60s but that corrupted the
// "returned past 5 min" funnel metric — a fresh signup that makes 6
// authed calls within 7s looked like a 0.328s ghost. 5s still cuts
// 95%+ of redundant writes for chat streams while keeping the funnel
// signal honest. Use GREATEST() to prevent fire-and-forget UPDATEs
// from rewinding last_activity on concurrent races.
const activityCache = new Map();
const ACTIVITY_DEBOUNCE = 5_000;

function updateActivity(userId, req) {
  const now = Date.now();
  const last = activityCache.get(userId);
  if (last && now - last < ACTIVITY_DEBOUNCE) return;
  activityCache.set(userId, now);

  const pool = getPool();
  if (!pool) return;

  const ip = req.ip || '';
  const ua = req.get('User-Agent') || null;
  pool.query(
    'UPDATE users SET last_activity = GREATEST(last_activity, NOW()), ip_address = COALESCE($2, ip_address), user_agent = COALESCE($3, user_agent) WHERE id = $1',
    [userId, ip, ua]
  ).catch(() => {});

  // One-shot sentinel: emit `first_authenticated_request` the very first
  // time this user makes an authenticated request. Decisively separates
  // "client never returned" from "client returned but bounced off Pricing"
  // in future analyses. Fire-and-forget; hasEvent + insert race is fine.
  hasEvent(userId, 'first_authenticated_request').then((seen) => {
    if (!seen) {
      logEvent(userId, 'first_authenticated_request', {
        path: req.originalUrl || req.url || null,
        user_agent: ua,
      });
    }
  }).catch(() => {});
}

// Cleanup old entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - ACTIVITY_DEBOUNCE * 2;
  for (const [id, ts] of activityCache) {
    if (ts < cutoff) activityCache.delete(id);
  }
}, 10 * 60_000);

function extractToken(req) {
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { userId } = verifyAccessToken(token);
    req.userId = userId;
    updateActivity(userId, req);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const { userId } = verifyAccessToken(token);
    req.userId = userId;
    updateActivity(userId, req);
  } catch {
    // ignore invalid tokens for optional auth
  }
  next();
}

module.exports = { authenticate, optionalAuth };
