/**
 * API consumption tracking + tip threshold logic.
 * Tracks every AI API call cost and checks when to request tips.
 */

const { getPool } = require('./db');
const { getRedis } = require('./redis');
const { logEvent, EVENT_TYPES } = require('./events');

const THRESHOLD_CACHE_TTL = 60; // seconds
const TIP_REQUEST_COOLDOWN_SECONDS = 6 * 60 * 60; // 6 hours per user+source

/**
 * Atomically claim a tip-request slot for (userId, source) using Redis SET NX EX.
 * Returns true if the slot was acquired (no cooldown active — caller may prompt + log),
 * false if the cooldown is still active (caller must skip both event log and UI prompt).
 * Falls back to true if Redis is unavailable so the flow never silently dies.
 */
async function acquireTipRequestSlot(userId, source) {
  if (!userId || !source) return true;
  const redis = getRedis();
  if (!redis) return true;
  const key = `tip_request_cooldown:${userId}:${source}`;
  try {
    const set = await redis.set(key, '1', 'EX', TIP_REQUEST_COOLDOWN_SECONDS, 'NX');
    return set === 'OK';
  } catch {
    return true;
  }
}

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

  // Sum all tips this month (amount is in cents → divide by 100).
  // Filter to status='succeeded' so pending/failed rows don't count as revenue.
  const { rows: tipRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) / 100.0 AS monthly_tips
     FROM tips
     WHERE user_id = $1
       AND status = 'succeeded'
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

  // Per-user+source cooldown: only emit the UI prompt and event log once per
  // TIP_REQUEST_COOLDOWN_SECONDS so a single user can't loop the modal and
  // generate runaway tip_requested events. mediaBlocked stays driven by real
  // cost so the spend cap is still enforced even while the prompt is muted.
  let promptAllowed = false;
  if (exceeded) {
    promptAllowed = await acquireTipRequestSlot(userId, 'monthly_threshold');
  }

  const result = {
    shouldRequestTip: exceeded && promptAllowed,
    mediaBlocked: exceeded,
    monthlyCost,
    monthlyTips,
  };

  // Cache in Redis (already honors the cooldown — shouldRequestTip is gated above)
  if (redis) {
    try { await redis.setex(cacheKey, THRESHOLD_CACHE_TTL, JSON.stringify(result)); } catch {}
  }

  // Only log when the cooldown slot was acquired this call — prevents the
  // modal-loop pattern (~2x/hour for days) from flooding tip_requested events.
  if (exceeded && promptAllowed) {
    logEvent(userId, EVENT_TYPES.TIP_REQUESTED, {
      source: 'monthly_threshold',
      isTrial: !!isTrial,
      threshold,
      net_cost: Number(netCost.toFixed(4)),
    });
  }

  return result;
}

/**
 * Check if a free (unsubscribed) user has exceeded any free-tier cost cap.
 * Returns { blocked, reason } where reason is one of:
 *   - 'lifetime_cap'  — lifetime spend >= free_lifetime_cost_cap_usd (default $5.00)
 *   - 'daily_cap'     — today's spend >= free_daily_cost_cap_usd (default $0.30)
 *   - 'weekly_limit'  — week-to-date spend >= tip_request_threshold_free_usd
 *   - null            — under all caps
 * Lifetime > daily > weekly precedence so the frontend can show the
 * strongest message ("trial exhausted, upgrade") instead of the recurring
 * weekly tip modal once a user has clearly used up their free trial.
 * A cap of 0 means "disabled" (matches existing free-threshold convention).
 */
async function checkFreeLimit(userId) {
  const pool = getPool();
  if (!pool) return { blocked: false, reason: null };

  const { rows: costRows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN created_at >= date_trunc('week', NOW()) THEN cost_usd ELSE 0 END), 0) AS weekly_cost,
       COALESCE(SUM(CASE WHEN created_at >= date_trunc('day',  NOW()) THEN cost_usd ELSE 0 END), 0) AS daily_cost,
       COALESCE(SUM(cost_usd), 0) AS lifetime_cost
     FROM api_consumption
     WHERE user_id = $1`,
    [userId]
  );
  const weeklyCost = parseFloat(costRows[0].weekly_cost);
  const dailyCost = parseFloat(costRows[0].daily_cost);
  const lifetimeCost = parseFloat(costRows[0].lifetime_cost);

  const { rows: settings } = await pool.query(
    `SELECT key, value FROM app_settings
     WHERE key IN ('tip_request_threshold_free_usd', 'free_daily_cost_cap_usd', 'free_lifetime_cost_cap_usd')`
  );
  const settingsMap = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const weeklyThreshold = parseFloat(settingsMap['tip_request_threshold_free_usd'] || '0.10');
  const dailyCap = parseFloat(settingsMap['free_daily_cost_cap_usd'] || '0.30');
  const lifetimeCap = parseFloat(settingsMap['free_lifetime_cost_cap_usd'] || '5.00');

  // Lifetime cap fires first — once burned, no further free use.
  if (lifetimeCap > 0 && lifetimeCost >= lifetimeCap) {
    return { blocked: true, reason: 'lifetime_cap' };
  }
  // Daily cap fires next — slows runaway burn within a single day.
  if (dailyCap > 0 && dailyCost >= dailyCap) {
    return { blocked: true, reason: 'daily_cap' };
  }
  // Weekly threshold last — the existing soft-paywall behaviour.
  if (weeklyThreshold > 0 && weeklyCost >= weeklyThreshold) {
    return { blocked: true, reason: 'weekly_limit' };
  }
  return { blocked: false, reason: null };
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
    ? `WHERE t.status = 'succeeded' AND t.created_at >= NOW() - INTERVAL '${interval}'`
    : `WHERE t.status = 'succeeded'`;

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
        SUM(CASE WHEN call_type = 'tts' THEN cost ELSE 0 END) AS tts_cost,
        SUM(CASE WHEN call_type = 'stt' THEN cost ELSE 0 END) AS stt_cost
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
      (SELECT COALESCE(json_agg(json_build_object('companion_name', companion_name, 'user_email', user_email, 'cost', cost, 'calls', calls, 'chat_cost', chat_cost, 'image_cost', image_cost, 'video_cost', video_cost, 'tts_cost', tts_cost, 'stt_cost', stt_cost) ORDER BY cost DESC), '[]') FROM by_companion_named) AS by_companion
  `);

  // Daily breakdown
  const dailyDateFilter = interval
    ? `WHERE created_at >= NOW() - INTERVAL '${interval}'`
    : '';
  const dailyTipFilter = interval
    ? `WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '${interval}'`
    : `WHERE status = 'succeeded'`;

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

/**
 * Get Fish.audio TTS usage from local consumption records.
 * @param {string} period - '7d', '30d', '90d', or 'all'
 */
async function getFishAudioUsage(period = '30d') {
  const pool = getPool();
  if (!pool) return null;

  const interval = period === 'all' ? null
    : period === '7d' ? '7 days'
    : period === '90d' ? '90 days'
    : '30 days';

  const dateFilter = interval
    ? `AND created_at >= NOW() - INTERVAL '${interval}'`
    : '';

  const { rows } = await pool.query(`
    SELECT
      call_type,
      COUNT(*) AS calls,
      SUM(COALESCE((metadata->>'bytes')::numeric, COALESCE((metadata->>'credits')::numeric, 0))) AS bytes,
      SUM(cost_usd) AS cost
    FROM api_consumption
    WHERE provider = 'fish_audio' ${dateFilter}
    GROUP BY call_type
  `);

  let totalBytes = 0;
  let totalCost = 0;
  const breakdown = {};
  for (const r of rows) {
    const bytes = parseFloat(r.bytes) || 0;
    const cost = parseFloat(r.cost) || 0;
    totalBytes += bytes;
    totalCost += cost;
    breakdown[r.call_type] = { calls: parseInt(r.calls), bytes, cost };
  }
  return { totalBytes, totalCost, breakdown };
}

module.exports = {
  trackConsumption,
  resetTipCounter,
  checkMediaBlocked,
  checkFreeLimit,
  invalidateThresholdCache,
  getConsumptionSummary,
  getFishAudioUsage,
  acquireTipRequestSlot,
};
