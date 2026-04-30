/**
 * Funnel event log — writes discrete user events to the `user_events` table.
 *
 * Used to answer "where do users drop off" without re-deriving from messages
 * and api_consumption. Fire-and-forget: errors are logged but never thrown,
 * so instrumentation can never break a request path.
 */

const { getPool } = require('./db');

async function logEvent(userId, eventType, metadata = {}) {
  if (!userId || !eventType) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO user_events (user_id, event_type, metadata) VALUES ($1, $2, $3)`,
      [userId, eventType, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.warn('[events] logEvent failed:', err.message);
  }
}

/**
 * Returns true at most once per user — used so the first message ever
 * sent emits `first_message_sent` exactly once.
 */
async function hasEvent(userId, eventType) {
  const pool = getPool();
  if (!pool) return true;
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM user_events WHERE user_id = $1 AND event_type = $2 LIMIT 1`,
      [userId, eventType]
    );
    return rows.length > 0;
  } catch {
    return true;
  }
}

const EVENT_TYPES = {
  SIGNUP: 'signup',
  COMPANION_CREATED: 'companion_created',
  FIRST_MESSAGE_SENT: 'first_message_sent',
  PAYWALL_BLOCKED: 'paywall_blocked',
  TIP_REQUESTED: 'tip_requested',
};

module.exports = { logEvent, hasEvent, EVENT_TYPES };
