/**
 * Background scheduler — runs periodic tasks via setInterval.
 */

const { getPool } = require('./db');
const { getRedis } = require('./redis');
const {
  sendAbandonedPaymentReminder,
  sendWelcomeDay0, sendWelcomeDay1, sendWelcomeDay3,
  sendRenewalReminder,
} = require('./email');
const { runProactiveMessages } = require('./proactive');
const { startDigestWorker } = require('./daily-digest');

const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

// -- Email frequency cap (max 2 notification emails per user per day) --

async function checkEmailFrequencyCap(pool, userId, maxPerDay = 2) {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `email_freq:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 86400);
      return count <= maxPerDay;
    } catch {}
  }
  // Fallback: check email_reminders table
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM email_reminders
     WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );
  return (rows[0]?.count || 0) < maxPerDay;
}

// -- Abandoned payment reminders (existing) -----------------------

async function runAbandonedPaymentReminders() {
  const pool = getPool();
  if (!pool) return;

  try {
    // Users created 24-48h ago with no subscription and no reminder sent yet
    // Join most recently active companion for personal email
    const { rows } = await pool.query(`
      SELECT u.id, COALESCE(u.real_email, u.email) AS email, u.display_name,
             comp.name AS companion_name, comp.id AS companion_id
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN email_reminders r ON r.user_id = u.id AND r.reminder_type = 'abandoned_payment'
      LEFT JOIN LATERAL (
        SELECT uc.id, uc.name FROM user_companions uc
        LEFT JOIN conversations c ON c.user_id = u.id AND c.companion_id = uc.id
        WHERE uc.user_id = u.id AND uc.is_active = true
        ORDER BY c.last_message_at DESC NULLS LAST, uc.created_at DESC
        LIMIT 1
      ) comp ON true
      WHERE u.created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'
        AND s.id IS NULL
        AND r.id IS NULL
        AND u.email NOT LIKE '%@telegram.lovetta.ai'
        AND u.email NOT LIKE '%@apple.lovetta.ai'
        AND u.email NOT LIKE '%@example.com'
        AND u.email NOT LIKE '%@test.com'
        AND (u.marketing_unsubscribed IS NULL OR u.marketing_unsubscribed = false)
        AND (u.email_disabled IS NULL OR u.email_disabled = false)
    `);

    for (const user of rows) {
      try {
        if (!(await checkEmailFrequencyCap(pool, user.id))) continue;
        await sendAbandonedPaymentReminder(user.email, user.display_name, user.id, user.companion_name, user.companion_id);
        await pool.query(
          `INSERT INTO email_reminders (user_id, reminder_type) VALUES ($1, 'abandoned_payment') ON CONFLICT DO NOTHING`,
          [user.id]
        );
        console.log(`[scheduler] Sent abandoned payment reminder to ${user.email}${user.companion_name ? ` from ${user.companion_name}` : ''}`);
      } catch (err) {
        console.error(`[scheduler] Failed to send reminder to ${user.email}:`, err.message);
      }
    }

    if (rows.length > 0) {
      console.log(`[scheduler] Sent ${rows.length} abandoned payment reminder(s)`);
    }
  } catch (err) {
    console.error('[scheduler] runAbandonedPaymentReminders error:', err.message);
  }
}

// -- Welcome email series -----------------------------------------

async function runWelcomeEmailSeries() {
  const pool = getPool();
  if (!pool) return;

  try {
    // Day 0: users created in the last hour, no welcome_day0 yet
    const { rows: day0 } = await pool.query(`
      SELECT u.id, COALESCE(u.real_email, u.email) AS email, u.display_name
      FROM users u
      LEFT JOIN email_reminders r ON r.user_id = u.id AND r.reminder_type = 'welcome_day0'
      WHERE u.created_at > NOW() - INTERVAL '1 hour'
        AND r.id IS NULL
        AND u.email NOT LIKE '%@telegram.lovetta.ai'
        AND u.email NOT LIKE '%@apple.lovetta.ai'
        AND u.email NOT LIKE '%@example.com'
        AND u.email NOT LIKE '%@test.com'
        AND (u.marketing_unsubscribed IS NULL OR u.marketing_unsubscribed = false)
        AND (u.email_disabled IS NULL OR u.email_disabled = false)
    `);

    for (const user of day0) {
      try {
        if (!(await checkEmailFrequencyCap(pool, user.id))) continue;
        await sendWelcomeDay0(user.email, user.display_name, user.id);
        await pool.query(
          `INSERT INTO email_reminders (user_id, reminder_type) VALUES ($1, 'welcome_day0') ON CONFLICT DO NOTHING`,
          [user.id]
        );
        console.log(`[scheduler] Sent welcome day 0 to ${user.email}`);
      } catch (err) {
        console.error(`[scheduler] welcome_day0 failed for ${user.email}:`, err.message);
      }
    }

    // Day 1: users created 23-25h ago, no welcome_day1, no user messages sent
    // Join most recently active companion for personal email
    const { rows: day1 } = await pool.query(`
      SELECT u.id, COALESCE(u.real_email, u.email) AS email, u.display_name,
             comp.name AS companion_name, comp.id AS companion_id
      FROM users u
      LEFT JOIN email_reminders r ON r.user_id = u.id AND r.reminder_type = 'welcome_day1'
      LEFT JOIN conversations c2 ON c2.user_id = u.id
      LEFT JOIN messages m ON m.conversation_id = c2.id AND m.role = 'user'
      LEFT JOIN LATERAL (
        SELECT uc.id, uc.name FROM user_companions uc
        LEFT JOIN conversations c ON c.user_id = u.id AND c.companion_id = uc.id
        WHERE uc.user_id = u.id AND uc.is_active = true
        ORDER BY c.last_message_at DESC NULLS LAST, uc.created_at DESC
        LIMIT 1
      ) comp ON true
      WHERE u.created_at BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
        AND r.id IS NULL
        AND m.id IS NULL
        AND u.email NOT LIKE '%@telegram.lovetta.ai'
        AND u.email NOT LIKE '%@apple.lovetta.ai'
        AND u.email NOT LIKE '%@example.com'
        AND u.email NOT LIKE '%@test.com'
        AND (u.marketing_unsubscribed IS NULL OR u.marketing_unsubscribed = false)
        AND (u.email_disabled IS NULL OR u.email_disabled = false)
    `);

    for (const user of day1) {
      try {
        if (!(await checkEmailFrequencyCap(pool, user.id))) continue;
        await sendWelcomeDay1(user.email, user.display_name, user.id, user.companion_name, user.companion_id);
        await pool.query(
          `INSERT INTO email_reminders (user_id, reminder_type) VALUES ($1, 'welcome_day1') ON CONFLICT DO NOTHING`,
          [user.id]
        );
        console.log(`[scheduler] Sent welcome day 1 to ${user.email}${user.companion_name ? ` from ${user.companion_name}` : ''}`);
      } catch (err) {
        console.error(`[scheduler] welcome_day1 failed for ${user.email}:`, err.message);
      }
    }

    // Day 3: users created 71-73h ago, still on trial, no welcome_day3
    // Join most recently active companion for personal email
    const { rows: day3 } = await pool.query(`
      SELECT u.id, COALESCE(u.real_email, u.email) AS email, u.display_name,
             comp.name AS companion_name, comp.id AS companion_id
      FROM users u
      JOIN subscriptions s ON s.user_id = u.id AND s.status = 'trialing'
      LEFT JOIN email_reminders r ON r.user_id = u.id AND r.reminder_type = 'welcome_day3'
      LEFT JOIN LATERAL (
        SELECT uc.id, uc.name FROM user_companions uc
        LEFT JOIN conversations c ON c.user_id = u.id AND c.companion_id = uc.id
        WHERE uc.user_id = u.id AND uc.is_active = true
        ORDER BY c.last_message_at DESC NULLS LAST, uc.created_at DESC
        LIMIT 1
      ) comp ON true
      WHERE u.created_at BETWEEN NOW() - INTERVAL '73 hours' AND NOW() - INTERVAL '71 hours'
        AND r.id IS NULL
        AND u.email NOT LIKE '%@telegram.lovetta.ai'
        AND u.email NOT LIKE '%@apple.lovetta.ai'
        AND u.email NOT LIKE '%@example.com'
        AND u.email NOT LIKE '%@test.com'
        AND (u.marketing_unsubscribed IS NULL OR u.marketing_unsubscribed = false)
        AND (u.email_disabled IS NULL OR u.email_disabled = false)
    `);

    for (const user of day3) {
      try {
        if (!(await checkEmailFrequencyCap(pool, user.id))) continue;
        await sendWelcomeDay3(user.email, user.display_name, user.id, user.companion_name, user.companion_id);
        await pool.query(
          `INSERT INTO email_reminders (user_id, reminder_type) VALUES ($1, 'welcome_day3') ON CONFLICT DO NOTHING`,
          [user.id]
        );
        console.log(`[scheduler] Sent welcome day 3 to ${user.email}${user.companion_name ? ` from ${user.companion_name}` : ''}`);
      } catch (err) {
        console.error(`[scheduler] welcome_day3 failed for ${user.email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[scheduler] runWelcomeEmailSeries error:', err.message);
  }
}

// -- Subscription renewal reminders --------------------------------

async function runRenewalReminders() {
  const pool = getPool();
  if (!pool) return;

  try {
    // Active subscriptions renewing in ~3 days (71-73h window)
    const { rows } = await pool.query(`
      SELECT u.id, COALESCE(u.real_email, u.email) AS email, u.display_name, s.current_period_end
      FROM users u
      JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
      LEFT JOIN email_reminders r ON r.user_id = u.id AND r.reminder_type = 'renewal_reminder'
      WHERE s.current_period_end BETWEEN NOW() + INTERVAL '71 hours' AND NOW() + INTERVAL '73 hours'
        AND r.id IS NULL
        AND u.email NOT LIKE '%@telegram.lovetta.ai'
        AND u.email NOT LIKE '%@apple.lovetta.ai'
        AND u.email NOT LIKE '%@example.com'
        AND u.email NOT LIKE '%@test.com'
        AND (u.email_disabled IS NULL OR u.email_disabled = false)
    `);

    for (const user of rows) {
      try {
        if (!(await checkEmailFrequencyCap(pool, user.id))) continue;
        await sendRenewalReminder(user.email, user.display_name, user.current_period_end);
        await pool.query(
          `INSERT INTO email_reminders (user_id, reminder_type) VALUES ($1, 'renewal_reminder') ON CONFLICT DO NOTHING`,
          [user.id]
        );
        console.log(`[scheduler] Sent renewal reminder to ${user.email}`);
      } catch (err) {
        console.error(`[scheduler] renewal_reminder failed for ${user.email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[scheduler] runRenewalReminders error:', err.message);
  }
}

// -- Online snapshots (every 1 min) ---------------------------------

async function runOnlineSnapshot() {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(`
      INSERT INTO online_snapshots (visitors_online, users_online, users_web, users_ios)
      SELECT
        (SELECT COUNT(*) FROM visitors WHERE last_activity >= NOW() - INTERVAL '5 minutes'),
        COUNT(*),
        COUNT(*) FILTER (WHERE NOT ((user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%') AND user_agent NOT LIKE '%Safari/%')),
        COUNT(*) FILTER (WHERE (user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%') AND user_agent NOT LIKE '%Safari/%')
      FROM users
      WHERE last_activity >= NOW() - INTERVAL '5 minutes'
    `);

    // Purge snapshots older than 48h
    await pool.query(`DELETE FROM online_snapshots WHERE ts < NOW() - INTERVAL '48 hours'`);

    // Report to central tracker (non-blocking)
    const { rows: [{ count: usersOnline }] } = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE last_activity >= NOW() - INTERVAL '5 minutes'`);
    fetch('https://tracker-vt-94773e1894c9.herokuapp.com/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': process.env.TRACKER_TOKEN || '' }, body: JSON.stringify({ projectId: 'lovetta', usersOnline }) }).catch(() => {});
  } catch (err) {
    console.error('[scheduler] runOnlineSnapshot error:', err.message);
  }
}

// -- Scheduler startup --------------------------------------------

function startScheduler() {
  if (process.env.NODE_ENV === 'test') return;

  console.log('[scheduler] Starting background scheduler');

  // Abandoned payment reminders — hourly
  setInterval(runAbandonedPaymentReminders, ONE_HOUR);
  setTimeout(runAbandonedPaymentReminders, 60 * 1000);

  // Welcome email series — hourly
  setInterval(runWelcomeEmailSeries, ONE_HOUR);
  setTimeout(runWelcomeEmailSeries, 90 * 1000);

  // Subscription renewal reminders — hourly
  setInterval(runRenewalReminders, ONE_HOUR);
  setTimeout(runRenewalReminders, 120 * 1000);

  // Proactive companion messages — every 30 min
  setInterval(runProactiveMessages, THIRTY_MINUTES);
  setTimeout(runProactiveMessages, 2 * 60 * 1000);

  // Online user snapshots — every 1 min
  setInterval(runOnlineSnapshot, ONE_MINUTE);
  setTimeout(runOnlineSnapshot, 15 * 1000);

  // Daily admin digest — checks hourly, sends at 9:00 UTC
  startDigestWorker();
}

module.exports = { startScheduler };
