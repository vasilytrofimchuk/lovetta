#!/usr/bin/env node
/**
 * One-off chat usage analysis. Read-only against DATABASE_URL.
 *
 * Run against prod:
 *   DATABASE_URL=$(heroku config:get DATABASE_URL -a lovetta) node scripts/chat-analysis.js
 *
 * Output: docs/CHAT_ANALYSIS_<YYYY-MM-DD>.md
 *
 * The TEST_FILTER fragment is copied verbatim from server/src/admin-api.js
 * so the cohort matches what the admin Funnel tab shows.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  console.error('Run: DATABASE_URL=$(heroku config:get DATABASE_URL -a lovetta) node scripts/chat-analysis.js');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
const pool = new Pool({
  connectionString: url,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 4,
  connectionTimeoutMillis: 10000,
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

// ---------- Markdown helpers ----------

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
  for (const r of rows) {
    w('| ' + r.map(formatCell).join(' | ') + ' |');
  }
  w('');
}

function formatCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'string') return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return String(v);
}

function escapeForBlock(s) {
  if (!s) return '';
  // Strip backtick fences inside transcript content so they don't escape the <details> block.
  return s.replace(/```/g, "''' ");
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ---------- Queries ----------

async function q1_dropoffHistogram() {
  const { rows } = await pool.query(`
    WITH dormant AS (
      SELECT c.id,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role='user')::int AS user_msgs
      FROM conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.last_message_at < NOW() - INTERVAL '7 days'
        AND c.last_message_at > NOW() - INTERVAL '60 days'
        AND u.deleted_at IS NULL AND ${TEST_FILTER}
    )
    SELECT bucket, COUNT(*)::int AS conversations, MIN(user_msgs) AS sort_key
    FROM (
      SELECT CASE
        WHEN user_msgs = 0 THEN '0 (never replied)'
        WHEN user_msgs BETWEEN 1 AND 2 THEN '1-2'
        WHEN user_msgs BETWEEN 3 AND 5 THEN '3-5'
        WHEN user_msgs BETWEEN 6 AND 10 THEN '6-10'
        WHEN user_msgs BETWEEN 11 AND 20 THEN '11-20'
        WHEN user_msgs BETWEEN 21 AND 50 THEN '21-50'
        ELSE '50+' END AS bucket,
      user_msgs FROM dormant
    ) t GROUP BY bucket ORDER BY MIN(user_msgs)
  `);
  return rows;
}

async function q2_lastRoleOfDormant() {
  const { rows } = await pool.query(`
    SELECT last_role, COUNT(*)::int AS dormant_convos FROM (
      SELECT DISTINCT ON (c.id) c.id, m.role AS last_role
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      JOIN users u ON u.id = c.user_id
      WHERE c.last_message_at < NOW() - INTERVAL '7 days'
        AND c.last_message_at > NOW() - INTERVAL '60 days'
        AND u.deleted_at IS NULL AND ${TEST_FILTER}
      ORDER BY c.id, m.created_at DESC
    ) t GROUP BY last_role ORDER BY dormant_convos DESC
  `);
  return rows;
}

async function q3_paywallTipBeforeGhost() {
  const { rows } = await pool.query(`
    WITH dormant_users AS (
      SELECT u.id, MAX(c.last_message_at) AS last_chat_at
      FROM users u
      JOIN conversations c ON c.user_id = u.id
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
      GROUP BY u.id
      HAVING MAX(c.last_message_at) < NOW() - INTERVAL '7 days'
         AND MAX(c.last_message_at) > NOW() - INTERVAL '60 days'
    )
    SELECT
      COUNT(*)::int AS total_dormant,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM user_events e WHERE e.user_id = du.id AND e.event_type = 'paywall_blocked'
          AND e.created_at BETWEEN du.last_chat_at - INTERVAL '1 hour' AND du.last_chat_at + INTERVAL '1 hour'
      ))::int AS paywall_near_end,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM user_events e WHERE e.user_id = du.id AND e.event_type = 'tip_requested'
          AND e.created_at BETWEEN du.last_chat_at - INTERVAL '1 hour' AND du.last_chat_at + INTERVAL '1 hour'
      ))::int AS tip_request_near_end,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = du.id AND s.status IN ('active','trialing')
      ))::int AS still_subscribed
    FROM dormant_users du
  `);
  return rows[0];
}

async function q4_topUsers(limit = 10) {
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.created_at,
      u.last_activity,
      u.country,
      u.device_type,
      u.auth_provider,
      (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.user_id = u.id AND m.role='user') AS user_msgs,
      (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.user_id = u.id) AS total_msgs,
      (SELECT COUNT(DISTINCT c.id)::int FROM conversations c WHERE c.user_id = u.id) AS num_convs,
      (SELECT COUNT(*)::int FROM user_companions uc WHERE uc.user_id = u.id) AS num_companions,
      EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active','trialing','past_due')) AS subscribed,
      COALESCE((SELECT SUM(amount)::int FROM tips t WHERE t.user_id = u.id AND t.status='succeeded'), 0) AS tips_cents
    FROM users u
    WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
    ORDER BY user_msgs DESC NULLS LAST
    LIMIT $1
  `, [limit]);
  return rows;
}

async function q5_usagePerUser(userIds) {
  if (!userIds.length) return [];
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.email,
      ROUND(AVG(LENGTH(m.content)) FILTER (WHERE m.role='user')::numeric, 1) AS avg_user_msg_len,
      ROUND(AVG(LENGTH(m.content)) FILTER (WHERE m.role='assistant')::numeric, 1) AS avg_ai_msg_len,
      COUNT(DISTINCT EXTRACT(HOUR FROM m.created_at AT TIME ZONE COALESCE(u.timezone,'UTC')))::int AS distinct_hours,
      COUNT(DISTINCT c.companion_id)::int AS companions_chatted,
      COUNT(*) FILTER (WHERE m.media_url IS NOT NULL)::int AS media_msgs,
      COUNT(*) FILTER (WHERE m.is_proactive = true)::int AS proactive_msgs,
      MIN(m.created_at) AS first_msg,
      MAX(m.created_at) AS last_msg,
      EXTRACT(DAY FROM (MAX(m.created_at) - MIN(m.created_at)))::int AS days_span
    FROM users u
    JOIN conversations c ON c.user_id = u.id
    JOIN messages m ON m.conversation_id = c.id
    WHERE u.id = ANY($1::uuid[])
    GROUP BY u.id, u.email
  `, [userIds]);
  return rows;
}

async function q5b_hourHistogram(userIds) {
  if (!userIds.length) return [];
  const { rows } = await pool.query(`
    SELECT u.id::text AS user_id,
           EXTRACT(HOUR FROM m.created_at AT TIME ZONE COALESCE(u.timezone,'UTC'))::int AS hr,
           COUNT(*)::int AS msgs
    FROM users u
    JOIN conversations c ON c.user_id = u.id
    JOIN messages m ON m.conversation_id = c.id AND m.role='user'
    WHERE u.id = ANY($1::uuid[])
    GROUP BY u.id, hr
    ORDER BY u.id, hr
  `, [userIds]);
  return rows;
}

async function q6_topConvForUser(userId) {
  const { rows } = await pool.query(`
    SELECT c.id, uc.name AS companion, COUNT(m.*)::int AS msgs
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    JOIN user_companions uc ON uc.id = c.companion_id
    WHERE c.user_id = $1
    GROUP BY c.id, uc.name
    ORDER BY msgs DESC
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

async function q6_transcript(convId, limit = 30) {
  const { rows } = await pool.query(`
    SELECT role, content, context_text, scene_text, media_url, media_type, is_proactive, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [convId, limit]);
  return rows.reverse();
}

async function q7_paywallSurvivors() {
  const { rows } = await pool.query(`
    WITH paywall_users AS (
      SELECT e.user_id, MIN(e.created_at) AS first_paywall_at
      FROM user_events e
      JOIN users u ON u.id = e.user_id
      WHERE e.event_type = 'paywall_blocked'
        AND u.deleted_at IS NULL AND ${TEST_FILTER}
      GROUP BY e.user_id
    )
    SELECT
      COUNT(*)::int AS total_paywalled,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.user_id = pu.user_id AND m.role='user' AND m.created_at > pu.first_paywall_at
      ))::int AS sent_msg_after,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = pu.user_id AND s.status IN ('active','trialing','past_due')
      ))::int AS subscribed_after,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM tips t WHERE t.user_id = pu.user_id AND t.status='succeeded' AND t.created_at > pu.first_paywall_at
      ))::int AS tipped_after
    FROM paywall_users pu
  `);
  return rows[0];
}

async function q8_companionPopularity() {
  const { rows } = await pool.query(`
    WITH engaged AS (
      SELECT u.id FROM users u
      WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
        AND (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id
             WHERE c.user_id = u.id AND m.role='user') >= 10
    )
    SELECT
      COALESCE(ct.name, '(custom)') AS companion,
      COALESCE(ct.style, '-') AS style,
      COUNT(DISTINCT uc.user_id)::int AS engaged_users_chose,
      COUNT(m.*)::int AS total_msgs,
      ROUND(AVG(per_user_msgs)::numeric, 1) AS avg_msgs_per_user
    FROM user_companions uc
    LEFT JOIN companion_templates ct ON ct.id = uc.template_id
    JOIN conversations c ON c.companion_id = uc.id
    JOIN messages m ON m.conversation_id = c.id
    JOIN engaged e ON e.id = uc.user_id
    JOIN LATERAL (
      SELECT COUNT(*)::int AS per_user_msgs
      FROM messages m2 JOIN conversations c2 ON c2.id=m2.conversation_id
      WHERE c2.companion_id = uc.id
    ) pum ON true
    GROUP BY ct.name, ct.style
    ORDER BY total_msgs DESC
    LIMIT 25
  `);
  return rows;
}

async function q0_overallTotals() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users u WHERE u.deleted_at IS NULL AND ${TEST_FILTER}) AS users_total,
      (SELECT COUNT(*)::int FROM users u WHERE u.deleted_at IS NULL AND ${TEST_FILTER}
        AND EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
                    WHERE c.user_id = u.id AND m.role='user')) AS users_with_msgs,
      (SELECT COUNT(*)::int FROM conversations c
        JOIN users u ON u.id = c.user_id
        WHERE u.deleted_at IS NULL AND ${TEST_FILTER}) AS conversations_total,
      (SELECT COUNT(*)::int FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN users u ON u.id = c.user_id
        WHERE u.deleted_at IS NULL AND ${TEST_FILTER}) AS messages_total,
      (SELECT COUNT(*)::int FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN users u ON u.id = c.user_id
        WHERE u.deleted_at IS NULL AND ${TEST_FILTER} AND m.role='user') AS user_messages_total
  `);
  return rows[0];
}

// ---------- Build report ----------

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Connecting to DB and running analysis for ${today}...`);

  const totals = await q0_overallTotals();
  console.log('  totals:', totals);

  const dropoff = await q1_dropoffHistogram();
  const lastRole = await q2_lastRoleOfDormant();
  const paywallGhost = await q3_paywallTipBeforeGhost();
  const topUsers = await q4_topUsers(10);
  const top3Ids = topUsers.slice(0, 3).map((u) => u.id);
  const usage = await q5_usagePerUser(top3Ids);
  const hourHist = await q5b_hourHistogram(top3Ids);
  const transcripts = [];
  for (const u of topUsers.slice(0, 3)) {
    const conv = await q6_topConvForUser(u.id);
    if (!conv) {
      transcripts.push({ user: u, conv: null, msgs: [] });
      continue;
    }
    const msgs = await q6_transcript(conv.id, 30);
    transcripts.push({ user: u, conv, msgs });
  }
  const survivors = await q7_paywallSurvivors();
  const popularity = await q8_companionPopularity();

  // Header
  w(`# Chat Usage Analysis — ${today}`);
  w('');
  w('Generated by `scripts/chat-analysis.js`. Read-only against prod DATABASE_URL.');
  w('Test users (`@example.com`, `@test.com`, `conativer+*@gmail.com`, `conativer@gmail.com`, `+test`, `+e2e`) are excluded.');
  w('');

  // § 0 totals
  w('## § 0. Overall totals (filtered)');
  w('');
  table(
    ['Real users', 'Users who sent ≥1 msg', 'Conversations', 'Messages (all)', 'Messages (user role)'],
    [[totals.users_total, totals.users_with_msgs, totals.conversations_total, totals.messages_total, totals.user_messages_total]]
  );

  // § 1
  w('## § 1. In-conversation drop-off');
  w('');
  w('Conversations that have been silent for **7+ days but were active within the last 60 days**, bucketed by how many user messages had been sent before going silent.');
  w('');
  table(
    ['User messages sent before ghost', 'Dormant conversations'],
    dropoff.map((r) => [r.bucket, r.conversations])
  );

  // § 2
  w('## § 2. Last-message role of dormant conversations');
  w('');
  w('In each ghosted conversation, who sent the very last message?');
  w('- `assistant` last → user got an AI reply and didn\'t respond. Possibly a content-quality / engagement-fade signal.');
  w('- `user` last → user sent a message and the AI either didn\'t reply or the user left right after.');
  w('');
  table(
    ['Last message role', 'Dormant conversations'],
    lastRole.map((r) => [r.last_role, r.dormant_convos])
  );

  // § 3
  w('## § 3. Did paywall / tip-request fire just before the ghost?');
  w('');
  w('For each user whose latest conversation activity is between 7 and 60 days ago, check whether `user_events` has a `paywall_blocked` or `tip_requested` row within ±1 hour of `last_message_at`.');
  w('');
  table(
    ['Total dormant users', 'Paywall near end', 'Tip-request near end', 'Still subscribed (sanity)'],
    [[paywallGhost.total_dormant, paywallGhost.paywall_near_end, paywallGhost.tip_request_near_end, paywallGhost.still_subscribed]]
  );
  if (paywallGhost.total_dormant > 0) {
    const pPaywall = ((paywallGhost.paywall_near_end / paywallGhost.total_dormant) * 100).toFixed(1);
    const pTip = ((paywallGhost.tip_request_near_end / paywallGhost.total_dormant) * 100).toFixed(1);
    w(`**${pPaywall}% of dormant users had a paywall block within an hour of going silent. ${pTip}% had a tip request.**`);
    w('');
  }

  // § 4
  w('## § 4. Top 10 most active users');
  w('');
  table(
    ['#', 'Email', 'Display name', 'Country', 'Device', 'Auth', 'User msgs', 'Total msgs', 'Convs', 'Companions', 'Sub', 'Tips $', 'Signed up', 'Last active'],
    topUsers.map((u, i) => [
      i + 1,
      u.email || '(none)',
      u.display_name || '',
      u.country || '',
      u.device_type || '',
      u.auth_provider || '',
      u.user_msgs,
      u.total_msgs,
      u.num_convs,
      u.num_companions,
      u.subscribed ? 'yes' : 'no',
      ((u.tips_cents || 0) / 100).toFixed(2),
      u.created_at,
      u.last_activity,
    ])
  );

  // § 5
  w('## § 5. How the top 3 users use it');
  w('');
  table(
    ['Email', 'Avg user msg len', 'Avg AI msg len', 'Distinct hours', 'Companions', 'Media msgs', 'Proactive msgs', 'First msg', 'Last msg', 'Days span'],
    usage.map((u) => [
      u.email,
      u.avg_user_msg_len,
      u.avg_ai_msg_len,
      u.distinct_hours,
      u.companions_chatted,
      u.media_msgs,
      u.proactive_msgs,
      u.first_msg,
      u.last_msg,
      u.days_span,
    ])
  );

  // hour histogram
  if (hourHist.length) {
    w('### Hour-of-day distribution (user-local time, user msgs only)');
    w('');
    const byUser = new Map();
    for (const row of hourHist) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Array(24).fill(0));
      byUser.get(row.user_id)[row.hr] = row.msgs;
    }
    const headers = ['Email', ...Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))];
    const rows = [];
    for (const u of usage) {
      const counts = byUser.get(u.id) || new Array(24).fill(0);
      rows.push([u.email, ...counts]);
    }
    table(headers, rows);
  }

  // § 6 transcripts
  w('## § 6. Sample transcripts (top 3 users, most active conversation)');
  w('');
  w('Last 30 messages from the top user\'s most active conversation. Content truncated to 300 chars.');
  w('');
  for (const t of transcripts) {
    w(`<details><summary><b>${t.user.email || '(no email)'}</b> &mdash; ${t.conv ? `${t.conv.companion} (${t.conv.msgs} msgs)` : '(no conversation)'}</summary>`);
    w('');
    if (!t.msgs.length) {
      w('_No messages._');
    } else {
      for (const m of t.msgs) {
        const ts = (m.created_at instanceof Date ? m.created_at : new Date(m.created_at)).toISOString().replace('T', ' ').slice(0, 19);
        const tag = m.is_proactive ? ' [proactive]' : (m.media_url ? ` [${m.media_type || 'media'}]` : '');
        const ctx = m.context_text ? ` *(${truncate(m.context_text, 80)})*` : '';
        w(`- **${ts} ${m.role}${tag}**${ctx}: ${escapeForBlock(truncate(m.content, 300))}`);
      }
    }
    w('');
    w('</details>');
    w('');
  }

  // § 7
  w('## § 7. Paywall survivors vs quitters');
  w('');
  w('Of users who ever hit `paywall_blocked` (single-conversation paywall trigger), how many came back and chatted, subscribed, or tipped after?');
  w('');
  table(
    ['Total paywalled', 'Sent msg after paywall', 'Subscribed (ever)', 'Tipped after paywall'],
    [[survivors.total_paywalled, survivors.sent_msg_after, survivors.subscribed_after, survivors.tipped_after]]
  );
  if (survivors.total_paywalled > 0) {
    const pBack = ((survivors.sent_msg_after / survivors.total_paywalled) * 100).toFixed(1);
    const pSub = ((survivors.subscribed_after / survivors.total_paywalled) * 100).toFixed(1);
    w(`**${pBack}% kept chatting after seeing the paywall. ${pSub}% ever subscribed.**`);
    w('');
  }

  // § 8
  w('## § 8. Companion popularity among engaged users (≥10 user msgs)');
  w('');
  table(
    ['Companion', 'Style', 'Engaged users', 'Total msgs', 'Avg msgs / user'],
    popularity.map((r) => [r.companion, r.style, r.engaged_users_chose, r.total_msgs, r.avg_msgs_per_user])
  );

  // Footer
  w('---');
  w('');
  w(`_Generated ${new Date().toISOString()} by \`scripts/chat-analysis.js\`._`);
  w('');

  // Write file
  const outDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `CHAT_ANALYSIS_${today}.md`);
  fs.writeFileSync(outPath, out.join('\n'));
  console.log(`\nReport written to ${outPath}`);
  await pool.end();
})().catch((err) => {
  console.error('FAILED:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
