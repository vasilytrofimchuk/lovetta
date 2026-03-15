/**
 * Auth middleware — JWT authentication for protected routes.
 */

const { verifyAccessToken } = require('./jwt');
const { getPool } = require('./db');

// Debounce activity updates (max 1 per minute per user)
const activityCache = new Map();
const ACTIVITY_DEBOUNCE = 60_000;

function updateActivity(userId, req) {
  const now = Date.now();
  const last = activityCache.get(userId);
  if (last && now - last < ACTIVITY_DEBOUNCE) return;
  activityCache.set(userId, now);

  const pool = getPool();
  if (!pool) return;

  const ip = req.ip || '';
  pool.query(
    'UPDATE users SET last_activity = NOW(), ip_address = COALESCE($2, ip_address) WHERE id = $1',
    [userId, ip]
  ).catch(() => {});
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
