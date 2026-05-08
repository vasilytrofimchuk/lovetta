#!/usr/bin/env node
/**
 * Follow-up read-only queries for the 2026-05-08 analysis. Validates:
 *  1. Whether proactive messages reach (and revive) dormant users in prod.
 *  2. Why the paywall doesn't trigger for heavy non-payers like Narinder.
 *
 * Run: DATABASE_URL=$(heroku config:get DATABASE_URL -a lovetta) node scripts/chat-analysis-followup.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
const pool = new Pool({
  connectionString: url,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 4,
});

const TEST_FILTER = `(
  u.email IS NULL OR (
    u.email NOT ILIKE '%@example.com'
    AND u.email NOT ILIKE '%@test.com'
    AND u.email NOT ILIKE 'conativer+%@gmail.com'
    AND u.email <> 'conativer@gmail.com'
    AND u.email NOT ILIKE '%+test%@%'
    AND u.email NOT ILIKE '%+e2e%@%'
  )
)`;

const out = [];
const w = (s = '') => out.push(s);

function table(headers, rows) {
  if (!rows.length) {
    w('_No rows._');
    w('');
    return;
  }
  w('| ' + headers.join(' | ') + ' |');
  w('| ' + headers.map(() => '---').join(' | ') + ' |');
  for (const r of rows) w('| ' + r.map(formatCell).join(' | ') + ' |');
  w('');
}

function formatCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  if (typeof v === 'string') return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return String(v);
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);

  w(`# Follow-up: Proactive Reach + Paywall Threshold — ${today}`);
  w('');
  w('Validates the two action items from `CHAT_ANALYSIS_2026-05-07.md` against prod data.');
  w('');

  // ---------------- PROACTIVE ----------------

  w('## § A. Proactive-message reach');
  w('');

  // A1 — total proactive messages sent ever
  const a1 = await pool.query(`
    SELECT COUNT(*)::int AS total_proactive,
           COUNT(DISTINCT m.conversation_id)::int AS conversations_with_proactive,
           MIN(m.created_at) AS first_proactive,
           MAX(m.created_at) AS last_proactive
    FROM messages m WHERE m.is_proactive = true
  `);
  w('### A1. Proactive messages ever sent');
  w('');
  table(
    ['Total', 'Conversations reached', 'First sent', 'Last sent'],
    [[a1.rows[0].total_proactive, a1.rows[0].conversations_with_proactive, a1.rows[0].first_proactive, a1.rows[0].last_proactive]]
  );

  // A2 — eligibility funnel: who can even receive a proactive?
  // Proactive requires: subscription active/canceling/trialing AND user_preferences.proactive_messages=true
  const a2 = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users u WHERE u.deleted_at IS NULL AND ${TEST_FILTER}) AS users_total,
      (SELECT COUNT(*)::int FROM users u
        WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                      AND s.status IN ('active','canceling','trialing'))
      ) AS users_subscribed,
      (SELECT COUNT(*)::int FROM users u
        WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                      AND s.status IN ('active','canceling','trialing'))
          AND EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id
                      AND up.proactive_messages = true)
      ) AS users_eligible
  `);
  w('### A2. Proactive eligibility (the system gates on active subscription)');
  w('');
  w('From `proactive.js:117-119` — only users with `subscriptions.status IN (active, canceling, trialing)` AND `user_preferences.proactive_messages = true` are eligible.');
  w('');
  table(
    ['Real users', 'Subscribed', 'Eligible (subscribed + opted-in)'],
    [[a2.rows[0].users_total, a2.rows[0].users_subscribed, a2.rows[0].users_eligible]]
  );

  // A3 — did proactives revive anyone? Find users who got a proactive while dormant
  // and then sent a user message AFTER it.
  const a3 = await pool.query(`
    WITH proactive_to_dormant AS (
      SELECT
        m.id AS proactive_id,
        m.conversation_id,
        c.user_id,
        m.created_at AS proactive_at,
        (SELECT MAX(m2.created_at) FROM messages m2
         WHERE m2.conversation_id = m.conversation_id
           AND m2.role = 'user'
           AND m2.created_at < m.created_at) AS last_user_msg_before
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.is_proactive = true
    ),
    classified AS (
      SELECT *,
        CASE
          WHEN last_user_msg_before IS NULL THEN 'no_prior_user_msg'
          WHEN proactive_at - last_user_msg_before >= INTERVAL '24 hours' THEN 'sent_to_dormant'
          ELSE 'sent_to_active'
        END AS dormancy
      FROM proactive_to_dormant
    )
    SELECT
      dormancy,
      COUNT(*)::int AS proactive_msgs,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM messages mr
        WHERE mr.conversation_id = classified.conversation_id
          AND mr.role = 'user'
          AND mr.created_at > classified.proactive_at
          AND mr.created_at <= classified.proactive_at + INTERVAL '7 days'
      ))::int AS user_replied_within_7d,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM messages mr
        WHERE mr.conversation_id = classified.conversation_id
          AND mr.role = 'user'
          AND mr.created_at > classified.proactive_at
          AND mr.created_at <= classified.proactive_at + INTERVAL '24 hours'
      ))::int AS user_replied_within_24h
    FROM classified
    GROUP BY dormancy
    ORDER BY dormancy
  `);
  w('### A3. Did proactive messages revive dormant users?');
  w('');
  w('Each proactive bucketed by how long the user had been silent in that conversation when the proactive was sent. "Dormant" = ≥24 h since last user message in that thread.');
  w('');
  table(
    ['Sent to', 'Proactive msgs', 'User replied within 7d', 'User replied within 24h'],
    a3.rows.map((r) => [r.dormancy, r.proactive_msgs, r.user_replied_within_7d, r.user_replied_within_24h])
  );

  // A4 — top dormant users (last activity 7-60d ago, with ≥1 user msg) and their proactive count
  const a4 = await pool.query(`
    WITH dormant AS (
      SELECT u.id, u.email, u.last_activity,
             (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
              WHERE c.user_id = u.id AND m.role='user') AS user_msgs,
             (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
              WHERE c.user_id = u.id AND m.is_proactive = true) AS proactives_received,
             EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                     AND s.status IN ('active','canceling','trialing')) AS subscribed
      FROM users u
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
        AND u.last_activity < NOW() - INTERVAL '7 days'
        AND u.last_activity > NOW() - INTERVAL '60 days'
        AND EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
                    WHERE c.user_id = u.id AND m.role='user')
    )
    SELECT
      COUNT(*)::int AS dormant_users,
      COUNT(*) FILTER (WHERE subscribed)::int AS dormant_subscribed,
      COUNT(*) FILTER (WHERE proactives_received > 0)::int AS dormant_received_proactive,
      COALESCE(SUM(proactives_received), 0)::int AS proactives_to_dormant_total
    FROM dormant
  `);
  w('### A4. Coverage: how many dormant users got *any* proactive?');
  w('');
  w('Cohort: users (with ≥1 prior user msg) whose last activity was 7–60 days ago — i.e. the ones we lost.');
  w('');
  table(
    ['Dormant users', 'Dormant + subscribed', 'Dormant who got a proactive', 'Total proactives to dormant'],
    [[a4.rows[0].dormant_users, a4.rows[0].dormant_subscribed, a4.rows[0].dormant_received_proactive, a4.rows[0].proactives_to_dormant_total]]
  );

  // ---------------- PAYWALL ----------------

  w('## § B. Why heavy non-payers bypass the paywall');
  w('');

  // B1 — the actual setting
  const b1 = await pool.query(`
    SELECT key, value FROM app_settings
    WHERE key IN ('tip_request_threshold_free_usd', 'tip_request_threshold_usd', 'tip_request_threshold_trial_usd')
    ORDER BY key
  `);
  w('### B1. The free-tier paywall is a *weekly cost* threshold, not a message count');
  w('');
  w('From `consumption.js:127-146` — `checkFreeLimit()` blocks only when `weekly_cost ≥ tip_request_threshold_free_usd`. There is no per-message, per-day, or lifetime cap anywhere in the chat-send path.');
  w('');
  table(
    ['Setting key', 'Value'],
    b1.rows.map((r) => [r.key, r.value])
  );

  // B2 — distribution of weekly cost (current week) among non-subscribers with messages
  const b2 = await pool.query(`
    WITH free_users AS (
      SELECT u.id
      FROM users u
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
        AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                        AND s.status IN ('active','canceling','trialing','past_due'))
    ),
    weekly AS (
      SELECT u.id,
             COALESCE((SELECT SUM(cost_usd) FROM api_consumption a
                       WHERE a.user_id = u.id
                         AND a.created_at >= date_trunc('week', NOW())), 0) AS weekly_cost
      FROM free_users u
    )
    SELECT bucket, COUNT(*)::int AS users FROM (
      SELECT CASE
        WHEN weekly_cost = 0 THEN '$0.00 (no activity this week)'
        WHEN weekly_cost < 0.01 THEN '<$0.01'
        WHEN weekly_cost < 0.05 THEN '$0.01 - $0.05'
        WHEN weekly_cost < 0.10 THEN '$0.05 - $0.10 (about to block)'
        ELSE '≥$0.10 (would block)'
      END AS bucket,
      weekly_cost FROM weekly
    ) t GROUP BY bucket ORDER BY MIN(weekly_cost)
  `);
  w('### B2. Free users\' actual weekly cost (current ISO week) vs $0.10 threshold');
  w('');
  table(
    ['Weekly cost bucket', 'Free users'],
    b2.rows.map((r) => [r.bucket, r.users])
  );

  // B3 — Lifetime + last 30d cost for the top 10 user-msg leaders, plus weekly cost in their peak week
  const b3 = await pool.query(`
    WITH leaders AS (
      SELECT u.id, u.email, u.created_at,
             (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
              WHERE c.user_id = u.id AND m.role='user') AS user_msgs,
             EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                     AND s.status IN ('active','canceling','trialing','past_due')) AS subscribed
      FROM users u
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
      ORDER BY user_msgs DESC NULLS LAST LIMIT 10
    )
    SELECT
      l.email,
      l.user_msgs,
      l.subscribed,
      ROUND(COALESCE((SELECT SUM(cost_usd)::numeric FROM api_consumption a WHERE a.user_id = l.id), 0), 4) AS lifetime_cost,
      ROUND(COALESCE((SELECT SUM(cost_usd)::numeric FROM api_consumption a
                      WHERE a.user_id = l.id AND a.created_at >= NOW() - INTERVAL '30 days'), 0), 4) AS last_30d_cost,
      ROUND(COALESCE((SELECT MAX(weekly) FROM (
        SELECT date_trunc('week', a.created_at) AS wk, SUM(cost_usd) AS weekly
        FROM api_consumption a WHERE a.user_id = l.id GROUP BY 1
      ) wk), 0)::numeric, 4) AS peak_week_cost,
      ROUND((COALESCE((SELECT SUM(cost_usd)::numeric FROM api_consumption a WHERE a.user_id = l.id), 0)
             / NULLIF(l.user_msgs, 0)), 6) AS avg_cost_per_user_msg
    FROM leaders l
    ORDER BY l.user_msgs DESC
  `);
  w('### B3. Top 10 active users — lifetime cost, peak week cost, $/msg');
  w('');
  w('Compare `peak_week_cost` against the $0.10 weekly threshold. If peak week is below $0.10, the paywall *never could have fired* for that user under the current setting.');
  w('');
  table(
    ['Email', 'User msgs', 'Sub', 'Lifetime $', 'Last 30d $', 'Peak week $', '$/user msg'],
    b3.rows.map((r) => [r.email, r.user_msgs, r.subscribed ? 'yes' : 'no', r.lifetime_cost, r.last_30d_cost, r.peak_week_cost, r.avg_cost_per_user_msg])
  );

  // B4 — what % of non-paying users have *ever* had a week ≥ $0.10?
  const b4 = await pool.query(`
    WITH free_users AS (
      SELECT u.id FROM users u
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
        AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                        AND s.status IN ('active','canceling','trialing','past_due'))
        AND EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
                    WHERE c.user_id = u.id AND m.role='user')
    ),
    peak AS (
      SELECT fu.id,
             COALESCE((SELECT MAX(weekly) FROM (
               SELECT date_trunc('week', a.created_at) AS wk, SUM(cost_usd) AS weekly
               FROM api_consumption a WHERE a.user_id = fu.id GROUP BY 1
             ) wk), 0) AS peak_week
      FROM free_users fu
    )
    SELECT
      COUNT(*)::int AS free_users_with_msgs,
      COUNT(*) FILTER (WHERE peak_week >= 0.10)::int AS ever_hit_threshold,
      COUNT(*) FILTER (WHERE peak_week >= 0.05)::int AS ever_above_5c,
      COUNT(*) FILTER (WHERE peak_week >= 0.01)::int AS ever_above_1c,
      ROUND(AVG(peak_week)::numeric, 4) AS avg_peak_week,
      ROUND(MAX(peak_week)::numeric, 4) AS max_peak_week
    FROM peak
  `);
  w('### B4. Across history: how many free users ever had a week that would have hit the paywall?');
  w('');
  table(
    ['Free users w/ msgs', 'Ever ≥ $0.10 (paywall-eligible)', 'Ever ≥ $0.05', 'Ever ≥ $0.01', 'Avg peak week $', 'Max peak week $'],
    [[
      b4.rows[0].free_users_with_msgs,
      b4.rows[0].ever_hit_threshold,
      b4.rows[0].ever_above_5c,
      b4.rows[0].ever_above_1c,
      b4.rows[0].avg_peak_week,
      b4.rows[0].max_peak_week,
    ]]
  );

  // B5 — total lifetime cost lost to non-payers
  const b5 = await pool.query(`
    SELECT
      ROUND(COALESCE(SUM(a.cost_usd), 0)::numeric, 4) AS spent_on_non_payers,
      ROUND(COALESCE((SELECT SUM(cost_usd) FROM api_consumption), 0)::numeric, 4) AS spent_total
    FROM api_consumption a
    JOIN users u ON u.id = a.user_id
    WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
                      AND s.status IN ('active','canceling','trialing','past_due'))
      AND NOT EXISTS (SELECT 1 FROM tips t WHERE t.user_id = u.id AND t.status='succeeded')
  `);
  w('### B5. Spend on never-paying users (lifetime)');
  w('');
  table(
    ['Spent on never-payers', 'Total API spend'],
    [[b5.rows[0].spent_on_non_payers, b5.rows[0].spent_total]]
  );

  w('---');
  w('');
  w(`_Generated ${new Date().toISOString()} by \`scripts/chat-analysis-followup.js\`._`);
  w('');

  const outDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `CHAT_ANALYSIS_FOLLOWUP_${today}.md`);
  fs.writeFileSync(outPath, out.join('\n'));
  console.log(`Report written to ${outPath}`);
  await pool.end();
})().catch((err) => {
  console.error('FAILED:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
