/**
 * API consumption tracking + tip threshold logic.
 * Tracks every AI API call cost and checks when to request tips.
 */

const { getPool } = require('./db');
const { getRedis } = require('./redis');

const THRESHOLD_CACHE_TTL = 60; // seconds

/**
 * Record an API call and update running cost balance.
 * Returns { shouldRequestTip } indicating if the companion should ask for a tip.
 */
async function trackConsumption({ userId, companionId, provider, model, callType, inputTokens = 0, outputTokens = 0, costUsd, metadata = {}, subscription }) {
  const pool = getPool();
  if (!pool) return { shouldRequestTip: false, mediaBlocked: false };

  // Insert consumption record
  await pool.query(
    `INSERT INTO api_consumption (user_id, companion_id, provider, model, call_type, input_tokens, output_tokens, cost_usd, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, companionId || null, provider, model, callType, inputTokens, outputTokens, costUsd, JSON.stringify(metadata)]
  );

  // If no companion, skip threshold check
  if (!companionId) return { shouldRequestTip: false, mediaBlocked: false };

  return _checkThreshold(pool, userId, subscription);
}

/**
 * Check if media should be blocked (threshold exceeded).
 * Used by request-media endpoint to bail early before calling LLM.
 */
async function checkMediaBlocked(userId, subscription) {
  const pool = getPool();
  if (!pool) return false;
  const result = await _checkThreshold(pool, userId, subscription);
  return result.mediaBlocked;
}

/**
 * Shared threshold check logic.
 * Uses cumulative formula: netCost = monthlyCost - monthlyTips.
 * Picks trial vs paid threshold based on subscription state.
 */
async function _checkThreshold(pool, userId, subscription) {
  // Try Redis cache first
  const redis = getRedis();
  const cacheKey = `threshold:${userId}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  // Check total cost for this user across ALL companions in the current calendar month
  const { rows: costRows } = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) AS monthly_cost
     FROM api_consumption
     WHERE user_id = $1
       AND created_at >= date_trunc('month', NOW())`,
    [userId]
  );
  const monthlyCost = parseFloat(costRows[0].monthly_cost);

  // Sum all tips this month (amount is in cents → divide by 100)
  const { rows: tipRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) / 100.0 AS monthly_tips
     FROM tips
     WHERE user_id = $1
       AND created_at >= date_trunc('month', NOW())`,
    [userId]
  );
  const monthlyTips = parseFloat(tipRows[0].monthly_tips);

  // Determine if user is on trial
  const isTrial = subscription?.trial_ends_at && new Date(subscription.trial_ends_at) > new Date();

  // Load both thresholds in one query
  const { rows: settings } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('tip_request_threshold_usd', 'tip_request_threshold_trial_usd')`
  );
  const settingsMap = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const threshold = isTrial
    ? parseFloat(settingsMap['tip_request_threshold_trial_usd'] || '0.30')
    : parseFloat(settingsMap['tip_request_threshold_usd'] || '10.00');

  const netCost = monthlyCost - monthlyTips;
  const exceeded = netCost >= threshold;

  const result = {
    shouldRequestTip: exceeded,
    mediaBlocked: exceeded,
    monthlyCost,
    monthlyTips,
  };

  // Cache in Redis
  if (redis) {
    try { await redis.setex(cacheKey, THRESHOLD_CACHE_TTL, JSON.stringify(result)); } catch {}
  }

  return result;
}

/**
 * Invalidate threshold cache for a user (call after tip payment).
 */
async function invalidateThresholdCache(userId) {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(`threshold:${userId}`); } catch {}
  }
}

/**
 * Reset the tip counter for a user (called when tip is received).
 * Now a no-op — threshold logic checks the tips table directly for current month.
 */
async function resetTipCounter(userId, companionId) {
  // No-op: tip insertion into `tips` table is sufficient.
  // trackConsumption checks tips table for current month.
}

/**
 * Get consumption summary for admin dashboard.
 * @param {string} period - '7d', '30d', '90d', or 'all'
 */
async function getConsumptionSummary(period = '30d') {
  const pool = getPool();
  if (!pool) return null;

  const interval = period === 'all' ? null
    : period === '7d' ? '7 days'
    : period === '90d' ? '90 days'
    : '30 days';

  const dateFilter = interval
    ? `WHERE ac.created_at >= NOW() - INTERVAL '${interval}'`
    : '';
  const tipDateFilter = interval
    ? `WHERE t.created_at >= NOW() - INTERVAL '${interval}'`
    : '';

  const { rows: [result] } = await pool.query(`
    WITH consumption AS (
      SELECT
        ac.provider,
        ac.model,
        ac.call_type,
        ac.companion_id,
        SUM(ac.cost_usd) AS cost,
        COUNT(*) AS calls,
        SUM(ac.input_tokens + ac.output_tokens) AS tokens
      FROM api_consumption ac
      ${dateFilter}
      GROUP BY ac.provider, ac.model, ac.call_type, ac.companion_id
    ),
    tip_totals AS (
      SELECT
        COALESCE(SUM(t.amount), 0) / 100.0 AS total_tips
      FROM tips t
      ${tipDateFilter}
    ),
    by_provider AS (
      SELECT provider, SUM(cost) AS cost, SUM(calls) AS calls
      FROM consumption
      GROUP BY provider
    ),
    by_model AS (
      SELECT model, provider, SUM(cost) AS cost, SUM(calls) AS calls, SUM(tokens) AS tokens
      FROM consumption
      GROUP BY model, provider
    ),
    by_companion AS (
      SELECT
        companion_id,
        SUM(cost) AS cost,
        SUM(calls) AS calls,
        SUM(CASE WHEN call_type = 'chat' THEN cost ELSE 0 END) AS chat_cost,
        SUM(CASE WHEN call_type = 'image' THEN cost ELSE 0 END) AS image_cost,
        SUM(CASE WHEN call_type = 'video' THEN cost ELSE 0 END) AS video_cost,
        SUM(CASE WHEN call_type = 'tts' THEN cost ELSE 0 END) AS tts_cost
      FROM consumption
      WHERE companion_id IS NOT NULL
      GROUP BY companion_id
    ),
    by_companion_named AS (
      SELECT
        bc.*,
        uc.name AS companion_name,
        u.email AS user_email
      FROM by_companion bc
      LEFT JOIN user_companions uc ON uc.id = bc.companion_id
      LEFT JOIN users u ON u.id = uc.user_id
    )
    SELECT
      (SELECT COALESCE(SUM(cost), 0) FROM consumption) AS total_cost_usd,
      (SELECT total_tips FROM tip_totals) AS total_tips,
      (SELECT COALESCE(json_agg(json_build_object('provider', provider, 'cost', cost, 'calls', calls)), '[]') FROM by_provider) AS by_provider,
      (SELECT COALESCE(json_agg(json_build_object('model', model, 'provider', provider, 'cost', cost, 'calls', calls, 'tokens', tokens)), '[]') FROM by_model) AS by_model,
      (SELECT COALESCE(json_agg(json_build_object('companion_name', companion_name, 'user_email', user_email, 'cost', cost, 'calls', calls, 'chat_cost', chat_cost, 'image_cost', image_cost, 'video_cost', video_cost, 'tts_cost', tts_cost) ORDER BY cost DESC), '[]') FROM by_companion_named) AS by_companion
  `);

  // Daily breakdown
  const dailyDateFilter = interval
    ? `WHERE created_at >= NOW() - INTERVAL '${interval}'`
    : '';
  const dailyTipFilter = interval
    ? `WHERE created_at >= NOW() - INTERVAL '${interval}'`
    : '';

  const { rows: daily } = await pool.query(`
    WITH daily_cost AS (
      SELECT DATE(created_at) AS date, SUM(cost_usd) AS cost
      FROM api_consumption
      ${dailyDateFilter}
      GROUP BY DATE(created_at)
    ),
    daily_tips AS (
      SELECT DATE(created_at) AS date, SUM(amount) / 100.0 AS tips
      FROM tips
      ${dailyTipFilter}
      GROUP BY DATE(created_at)
    )
    SELECT
      COALESCE(dc.date, dt.date) AS date,
      COALESCE(dc.cost, 0) AS cost,
      COALESCE(dt.tips, 0) AS tips
    FROM daily_cost dc
    FULL OUTER JOIN daily_tips dt ON dc.date = dt.date
    ORDER BY date DESC
    LIMIT 90
  `);

  return {
    totalCostUsd: parseFloat(result.total_cost_usd) || 0,
    totalTips: parseFloat(result.total_tips) || 0,
    byProvider: result.by_provider,
    byModel: result.by_model,
    byCompanion: result.by_companion,
    daily,
  };
}

module.exports = {
  trackConsumption,
  resetTipCounter,
  checkMediaBlocked,
  invalidateThresholdCache,
  getConsumptionSummary,
};
