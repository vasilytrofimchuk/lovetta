/**
 * Daily digest — sends a stats summary email to admin every day at 9:00 UTC.
 */

const { getPool } = require('./db');
const { sendEmail } = require('./email');

const ADMIN_EMAIL = process.env.ADMIN_FORWARD_EMAIL || 'vasilytrofimchuk@gmail.com';
const ADMIN_FROM = 'Lovetta <hello@lovetta.ai>';
const INTERVAL_MS = 60 * 60 * 1000; // check every hour
const DIGEST_HOUR = 9; // 9:00 UTC

let digestTimer = null;

async function getLastDigestDate(pool) {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'last_digest_date'`
  );
  return rows.length > 0 ? rows[0].value.date : null;
}

async function setLastDigestDate(pool, date) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('last_digest_date', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify({ date })]
  );
}

async function gatherStats() {
  const pool = getPool();
  if (!pool) return null;

  const q = async (sql) => {
    try { return await pool.query(sql); }
    catch { return { rows: [] }; }
  };

  const [users, visitors, leads, subs, mrr, companions, engagement, media, tips, aiCosts, support, feedback, emails, referrals, online] = await Promise.all([
    q(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auth_provider = 'email') AS today_email,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auth_provider = 'google') AS today_google,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auth_provider = 'apple') AS today_apple,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auth_provider = 'telegram') AS today_telegram
      FROM users`),
    q(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
      FROM visitors`),
    q(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
      FROM leads`),
    q(`SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS new_today,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'trialing') AS trialing,
        COUNT(*) AS total
      FROM subscriptions`),
    q(`SELECT
        COALESCE(SUM(CASE WHEN plan = 'monthly' THEN 19.99 WHEN plan = 'yearly' THEN 8.33 ELSE 0 END), 0)::numeric(10,2) AS mrr
      FROM subscriptions
      WHERE status IN ('active', 'trialing')`),
    q(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
      FROM user_companions`),
    q(`SELECT
        COUNT(*) FILTER (WHERE m.role = 'user') AS user_msgs,
        COUNT(*) FILTER (WHERE m.role = 'assistant') AS assistant_msgs,
        COUNT(*) FILTER (WHERE m.is_proactive = true) AS proactive_msgs,
        COUNT(*) FILTER (WHERE m.media_url IS NOT NULL) AS media_msgs
      FROM messages m
      WHERE m.created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        COUNT(*) FILTER (WHERE media_type = 'image') AS images,
        COUNT(*) FILTER (WHERE media_type = 'video') AS videos,
        COALESCE(SUM(cost_usd), 0)::numeric(10,4) AS cost
      FROM companion_media
      WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        COALESCE(SUM(amount), 0) AS total_cents,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE amount = 999) AS tier_10,
        COUNT(*) FILTER (WHERE amount = 1999) AS tier_20,
        COUNT(*) FILTER (WHERE amount = 4999) AS tier_50,
        COUNT(*) FILTER (WHERE amount = 9999) AS tier_100
      FROM tips
      WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        provider,
        SUM(cost_usd)::numeric(10,4) AS cost,
        COUNT(*) AS calls
      FROM api_consumption
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY provider
      ORDER BY cost DESC`),
    q(`SELECT
        COUNT(*) FILTER (WHERE status = 'open') AS open_tickets,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS new_today,
        COALESCE(SUM(unread_by_admin) FILTER (WHERE status = 'open'), 0) AS unread
      FROM support_chats`),
    q(`SELECT
        COUNT(*) AS new_today,
        COALESCE(AVG(rating), 0)::numeric(3,1) AS avg_rating
      FROM app_feedback
      WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound
      FROM companion_emails
      WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        COUNT(*) AS new_today,
        COALESCE(SUM(commission_amount), 0) AS total_cents
      FROM referral_commissions
      WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    q(`SELECT
        COALESCE(MAX(users_online), 0) AS peak_users,
        COALESCE(MAX(users_web), 0) AS peak_web,
        COALESCE(MAX(users_ios), 0) AS peak_ios,
        COALESCE(MAX(visitors_online), 0) AS peak_visitors
      FROM online_snapshots
      WHERE ts >= NOW() - INTERVAL '24 hours'`),
  ]);

  const empty = { rows: [{}] };
  const r = (res) => (res.rows.length > 0 ? res : empty).rows[0];
  const totalAiCost = aiCosts.rows.reduce((sum, row) => sum + parseFloat(row.cost || 0), 0);

  return {
    users: r(users),
    visitors: r(visitors),
    leads: r(leads),
    subs: r(subs),
    mrr: (r(mrr)).mrr || 0,
    companions: r(companions),
    engagement: r(engagement),
    media: r(media),
    tips: r(tips),
    aiCosts: aiCosts.rows,
    totalAiCost,
    support: r(support),
    feedback: r(feedback),
    emails: r(emails),
    referrals: r(referrals),
    online: r(online),
  };
}

const fmt = n => Number(n || 0).toLocaleString('en-US');
const fmtUsd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDigest(stats) {
  const date = new Date().toISOString().slice(0, 10);
  const s = stats;

  const tipDollars = (parseInt(s.tips.total_cents) || 0) / 100;
  const refDollars = (parseInt(s.referrals.total_cents) || 0) / 100;

  const aiLines = s.aiCosts.map(r => `  ${r.provider}: ${fmtUsd(r.cost)} (${fmt(r.calls)} calls)`).join('\n');

  // Tip tier breakdown
  const tierParts = [];
  if (parseInt(s.tips.tier_10)) tierParts.push(`${s.tips.tier_10}×$10`);
  if (parseInt(s.tips.tier_20)) tierParts.push(`${s.tips.tier_20}×$20`);
  if (parseInt(s.tips.tier_50)) tierParts.push(`${s.tips.tier_50}×$50`);
  if (parseInt(s.tips.tier_100)) tierParts.push(`${s.tips.tier_100}×$100`);
  const tierLine = tierParts.length > 0 ? `  Tiers:        ${tierParts.join(', ')}` : '';

  const text = [
    `Lovetta Daily Digest — ${date}`,
    '═'.repeat(42),
    '',
    'USERS',
    `  New signups:  ${fmt(s.users.today)}  (total: ${fmt(s.users.total)})`,
    `  Breakdown:    ${s.users.today_email || 0} email / ${s.users.today_google || 0} google / ${s.users.today_apple || 0} apple / ${s.users.today_telegram || 0} telegram`,
    '',
    'VISITORS',
    `  New (24h):    ${fmt(s.visitors.today)}  (total: ${fmt(s.visitors.total)})`,
    '',
    'LEADS',
    `  New (24h):    ${fmt(s.leads.today)}  (total: ${fmt(s.leads.total)})`,
    '',
    'SUBSCRIPTIONS',
    `  New (24h):    ${fmt(s.subs.new_today)}`,
    `  Active: ${fmt(s.subs.active)}   Trialing: ${fmt(s.subs.trialing)}   Total: ${fmt(s.subs.total)}`,
    `  MRR:          ${fmtUsd(s.mrr)}`,
    '',
    'COMPANIONS',
    `  Created (24h): ${fmt(s.companions.today)}  (total: ${fmt(s.companions.total)})`,
    '',
    'ENGAGEMENT (24h)',
    `  User messages:      ${fmt(s.engagement.user_msgs)}`,
    `  Assistant messages:  ${fmt(s.engagement.assistant_msgs)}`,
    `  Proactive messages:  ${fmt(s.engagement.proactive_msgs)}`,
    `  Messages with media: ${fmt(s.engagement.media_msgs)}`,
    '',
    'MEDIA GENERATED (24h)',
    `  Images: ${fmt(s.media.images)}   Videos: ${fmt(s.media.videos)}`,
    `  Cost:   ${fmtUsd(s.media.cost)}`,
    '',
    'TIPS (24h)',
    `  Total: ${fmtUsd(tipDollars)} (${fmt(s.tips.count)} tips)`,
    tierLine,
    '',
    'AI COSTS (24h)',
    aiLines || '  (none)',
    `  Total: ${fmtUsd(s.totalAiCost)}`,
    '',
    'SUPPORT',
    `  Open tickets: ${fmt(s.support.open_tickets)}   New (24h): ${fmt(s.support.new_today)}   Unread: ${fmt(s.support.unread)}`,
    '',
    'FEEDBACK (24h)',
    `  New ratings: ${fmt(s.feedback.new_today)}   Avg: ${s.feedback.avg_rating || '—'}★`,
    '',
    'COMPANION EMAILS (24h)',
    `  Outbound: ${fmt(s.emails.outbound)}   Inbound replies: ${fmt(s.emails.inbound)}`,
    '',
    'REFERRALS (24h)',
    `  New commissions: ${fmt(s.referrals.new_today)}   Total: ${fmtUsd(refDollars)}`,
    '',
    'ONLINE (24h peak)',
    `  Users: ${fmt(s.online.peak_users)} (web: ${fmt(s.online.peak_web)}, iOS: ${fmt(s.online.peak_ios)})`,
    `  Visitors: ${fmt(s.online.peak_visitors)}`,
    '',
    '—',
    'Lovetta automated digest',
  ].filter(l => l !== '').join('\n');

  const aiRowsHtml = s.aiCosts.map(r =>
    `<tr><td style="padding:4px 0;color:#b8a4d6;">${r.provider}</td><td style="text-align:right;color:#f0e6ff;">${fmtUsd(r.cost)} <span style="color:#b8a4d6;">(${fmt(r.calls)} calls)</span></td></tr>`
  ).join('');

  const tierHtml = tierParts.length > 0
    ? `<tr><td style="padding:4px 0;color:#b8a4d6;">Tiers</td><td style="text-align:right;color:#f0e6ff;">${tierParts.join(', ')}</td></tr>`
    : '';

  const section = (title) =>
    `<tr style="border-bottom:1px solid #2d1f45;"><td colspan="2" style="padding:12px 0 8px;color:#d6336c;font-weight:600;">${title}</td></tr>`;
  const row = (label, value, valueStyle = '') =>
    `<tr><td style="padding:4px 0;color:#b8a4d6;">${label}</td><td style="text-align:right;color:#f0e6ff;${valueStyle}">${value}</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#f0e6ff;background:#0f0a1a;padding:24px;border-radius:8px;">
      <h2 style="color:#d6336c;margin:0 0 16px;">Lovetta Daily Digest — ${date}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${section('Users')}
        ${row('New signups', `${fmt(s.users.today)} <span style="color:#b8a4d6;">(${fmt(s.users.total)} total)</span>`)}
        ${row('Breakdown', `${s.users.today_email || 0} email / ${s.users.today_google || 0} google / ${s.users.today_apple || 0} apple / ${s.users.today_telegram || 0} tg`)}

        ${section('Visitors')}
        ${row('New (24h)', `${fmt(s.visitors.today)} <span style="color:#b8a4d6;">(${fmt(s.visitors.total)} total)</span>`)}

        ${section('Leads')}
        ${row('New (24h)', `${fmt(s.leads.today)} <span style="color:#b8a4d6;">(${fmt(s.leads.total)} total)</span>`)}

        ${section('Subscriptions')}
        ${row('New (24h)', fmt(s.subs.new_today))}
        ${row('Active / Trialing', `${fmt(s.subs.active)} / ${fmt(s.subs.trialing)}`)}
        ${row('MRR', fmtUsd(s.mrr), 'color:#3fb950;font-weight:600;')}

        ${section('Companions')}
        ${row('Created (24h)', `${fmt(s.companions.today)} <span style="color:#b8a4d6;">(${fmt(s.companions.total)} total)</span>`)}

        ${section('Engagement (24h)')}
        ${row('User messages', fmt(s.engagement.user_msgs))}
        ${row('Assistant messages', fmt(s.engagement.assistant_msgs))}
        ${row('Proactive messages', fmt(s.engagement.proactive_msgs))}
        ${row('Messages with media', fmt(s.engagement.media_msgs))}

        ${section('Media Generated (24h)')}
        ${row('Images / Videos', `${fmt(s.media.images)} / ${fmt(s.media.videos)}`)}
        ${row('Cost', fmtUsd(s.media.cost), 'color:#f85149;')}

        ${section('Tips (24h)')}
        ${row('Total', `${fmtUsd(tipDollars)} <span style="color:#b8a4d6;">(${fmt(s.tips.count)} tips)</span>`, 'color:#3fb950;font-weight:600;')}
        ${tierHtml}

        ${section('AI Costs (24h)')}
        ${aiRowsHtml || '<tr><td style="padding:4px 0;color:#b8a4d6;" colspan="2">(none)</td></tr>'}
        ${row('Total', fmtUsd(s.totalAiCost), 'color:#f85149;font-weight:600;')}

        ${section('Support')}
        ${row('Open / New (24h)', `${fmt(s.support.open_tickets)} / ${fmt(s.support.new_today)}`)}
        ${row('Unread by admin', fmt(s.support.unread))}

        ${section('Feedback (24h)')}
        ${row('New ratings', fmt(s.feedback.new_today))}
        ${row('Avg rating', `${s.feedback.avg_rating || '—'}★`)}

        ${section('Companion Emails (24h)')}
        ${row('Outbound / Inbound', `${fmt(s.emails.outbound)} / ${fmt(s.emails.inbound)}`)}

        ${section('Referrals (24h)')}
        ${row('New commissions', fmt(s.referrals.new_today))}
        ${row('Commission total', fmtUsd(refDollars), 'color:#3fb950;')}

        ${section('Online (24h peak)')}
        ${row('Users', `${fmt(s.online.peak_users)} <span style="color:#b8a4d6;">(web: ${fmt(s.online.peak_web)}, iOS: ${fmt(s.online.peak_ios)})</span>`)}
        ${row('Visitors', fmt(s.online.peak_visitors))}
      </table>
      <p style="margin:16px 0 0;color:#7c6a9a;font-size:12px;">Lovetta automated digest</p>
    </div>
  `;

  return { subject: `[Lovetta] Daily digest — ${date}`, text, html };
}

async function sendDailyDigest() {
  try {
    const stats = await gatherStats();
    if (!stats) return;

    const { subject, text, html } = formatDigest(stats);
    await sendEmail({ from: ADMIN_FROM, to: ADMIN_EMAIL, subject, text, html });
    console.log('[digest] Daily digest sent');
  } catch (err) {
    console.error('[digest] Failed to send daily digest:', err.message);
  }
}

async function checkDigest() {
  const pool = getPool();
  if (!pool) return;
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getUTCHours() >= DIGEST_HOUR) {
      const lastDate = await getLastDigestDate(pool);
      if (lastDate !== today) {
        await setLastDigestDate(pool, today);
        sendDailyDigest();
      }
    }
  } catch (err) {
    console.error('[digest] checkDigest error (will retry next interval):', err.message);
  }
}

function startDigestWorker() {
  if (digestTimer) return;
  if (process.env.NODE_ENV === 'test') return;
  console.log('[digest] Worker started');
  setTimeout(checkDigest, 30 * 1000);
  digestTimer = setInterval(checkDigest, INTERVAL_MS);
}

module.exports = { startDigestWorker, sendDailyDigest };
