/**
 * Proactive messaging — companions reach out with morning, evening, and random messages.
 * Runs every 30 min via scheduler. Timezone-aware with user-configurable frequency.
 */

const { getPool } = require('./db');
const { plainChatCompletion, getAISettings } = require('./ai');
const { buildMemoryContext, buildUserContext } = require('./memory');
const { getEffectiveTextLevel } = require('./content-levels');
const { sendCompanionEmail } = require('./email');
const { isCompanionEmailDeliverable } = require('./email-deliverability');
const { sendPushNotification } = require('./push');
const { sendMessage: sendTelegramMessage } = require('./telegram');
const { getUserSubscription } = require('./billing');
const { trackConsumption, checkMediaBlocked } = require('./consumption');
const { logEvent, EVENT_TYPES } = require('./events');

const MAX_PER_USER_PER_DAY = 3;
const INACTIVITY_HOURS = 3;
const DEFAULT_TIMEZONE = 'America/New_York';

// Frequency settings: max per companion per day + cooldown hours
const FREQUENCY_CONFIG = {
  low:    { maxPerCompanion: 1, cooldownHours: 24 },
  normal: { maxPerCompanion: 2, cooldownHours: 8 },
  high:   { maxPerCompanion: 3, cooldownHours: 6 },
};

// Time windows for each slot (local hour)
const SLOT_WINDOWS = {
  morning: { start: 8, end: 11 },   // 8–11 AM
  evening: { start: 19, end: 22 },   // 7–10 PM
  random:  { start: 11, end: 19 },   // 11 AM–7 PM
};

async function isSettingEnabled(pool, key, defaultValue = true) {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
    if (!rows.length) return defaultValue;
    return rows[0].value !== false && rows[0].value !== 'false';
  } catch {
    return defaultValue;
  }
}

/**
 * Determine which proactive slot matches the user's current local time.
 * Returns 'morning', 'evening', 'random', or null (nighttime — don't send).
 */
function getCurrentSlot(timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    const now = new Date();
    const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    for (const [slot, { start, end }] of Object.entries(SLOT_WINDOWS)) {
      if (localHour >= start && localHour < end) return slot;
    }
    return null; // Nighttime
  } catch {
    // Invalid timezone — try default
    try {
      const now = new Date();
      const localHour = parseInt(now.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE, hour: 'numeric', hour12: false }));
      for (const [slot, { start, end }] of Object.entries(SLOT_WINDOWS)) {
        if (localHour >= start && localHour < end) return slot;
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Build a prompt for generating a proactive companion message.
 */
function buildProactivePrompt(companion, memoryContext, slot, { actionsEnabled = true } = {}) {
  const slotInstructions = {
    morning: `It's morning. Send a sweet "good morning" message — like you just woke up and he's the first thing on your mind. Be cozy and warm.`,
    evening: `It's evening. Send a relaxed message — like you're winding down and thinking of him. Be flirty and intimate.`,
    random: `You haven't heard from your boyfriend in a while. Send him a short, natural message — like you're thinking of him.`,
  };

  const actionInstruction = actionsEnabled
    ? `Start with a brief action in *asterisks*, then your message.
Example: *curls up on the couch and texts you* Hey... I was just thinking about you. How's your day going?`
    : `Write your message directly. Do NOT use asterisks or action descriptions.`;

  return `You are ${companion.name}, a ${companion.age || 22}-year-old woman.
${companion.personality || ''}
${companion.backstory || ''}
Communication style: ${companion.communication_style || 'warm and playful'}

${slotInstructions[slot] || slotInstructions.random}
Keep it 1-3 sentences. Be warm and in-character. Don't ask too many questions. Just reach out naturally.
Only reference topics actually discussed — never invent or assume details about their life.

${actionInstruction}

${memoryContext || ''}`;
}

/**
 * Main scheduler function — find inactive users and send proactive messages.
 */
async function runProactiveMessages() {
  const pool = getPool();
  if (!pool) return;

  if (!(await isSettingEnabled(pool, 'proactive_messages_enabled', false))) {
    await runFreeUserReactivation(pool);
    return;
  }

  try {
    // Find eligible user+companion pairs:
    // - User inactive 3+ hours
    // - Has active subscription
    // - Opted in to proactive messages
    // - Conversation exists with at least one message
    // - Cooldown since last proactive (checked per-frequency below)
    const { rows: candidates } = await pool.query(`
      SELECT
        u.id AS user_id, COALESCE(u.real_email, u.email) AS email, u.display_name, u.timezone,
        u.email AS account_email, u.real_email, u.email_disabled, u.email_type, u.marketing_unsubscribed,
        c.id AS conversation_id, c.companion_id, c.last_proactive_at,
        uc.name AS companion_name, uc.personality, uc.backstory,
        uc.traits, uc.communication_style, uc.age,
        tu.telegram_id,
        up.proactive_frequency,
        up.show_actions
      FROM users u
      LEFT JOIN user_preferences up ON up.user_id = u.id
      JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'canceling', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
      JOIN conversations c ON c.user_id = u.id
      JOIN user_companions uc ON uc.id = c.companion_id AND uc.is_active = true
      LEFT JOIN telegram_users tu ON tu.user_id = u.id
      WHERE u.last_activity < NOW() - INTERVAL '${INACTIVITY_HOURS} hours'
        AND COALESCE(up.proactive_messages, true) = true
        AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at ASC
      LIMIT 100
    `);

    // Track per-user counts for daily rate limit
    const userDailyCounts = {};

    for (const row of candidates) {
      try {
        const frequency = row.proactive_frequency || 'normal';
        const config = FREQUENCY_CONFIG[frequency] || FREQUENCY_CONFIG.normal;

        // Check cooldown
        if (row.last_proactive_at) {
          const hoursSince = (Date.now() - new Date(row.last_proactive_at).getTime()) / (1000 * 60 * 60);
          if (hoursSince < config.cooldownHours) continue;
        }

        // Determine current slot based on user timezone
        const slot = getCurrentSlot(row.timezone);
        if (!slot) continue; // Nighttime — skip

        // Check per-user daily limit
        if (!userDailyCounts[row.user_id]) {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM messages
             WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)
               AND is_proactive = true
               AND created_at > CURRENT_DATE`,
            [row.user_id]
          );
          userDailyCounts[row.user_id] = countRows[0]?.count || 0;
        }

        if (userDailyCounts[row.user_id] >= MAX_PER_USER_PER_DAY) continue;

        // Check per-companion daily limit (based on frequency)
        const { rows: compCount } = await pool.query(
          `SELECT COUNT(*)::int AS count FROM messages
           WHERE conversation_id = $1 AND is_proactive = true AND created_at > CURRENT_DATE`,
          [row.conversation_id]
        );
        if ((compCount[0]?.count || 0) >= config.maxPerCompanion) continue;

        // Check if this slot already sent today for this companion
        const { rows: slotCount } = await pool.query(
          `SELECT COUNT(*)::int AS count FROM messages
           WHERE conversation_id = $1 AND is_proactive = true AND proactive_slot = $2 AND created_at > CURRENT_DATE`,
          [row.conversation_id, slot]
        );
        if ((slotCount[0]?.count || 0) > 0) continue;

        // Skip if user exceeded tip threshold (media blocked = cost too high)
        const sub = await getUserSubscription(row.user_id);
        const blocked = await checkMediaBlocked(row.user_id, sub);
        if (blocked) continue;

        // Generate proactive message. Proactive has no explicit platform — use
        // the user's effective web-level as a safe default (least restrictive
        // that's still capped by their preference). Level 0 still skips kinks.
        const actionsEnabled = row.show_actions ?? true;
        const proLevel = await getEffectiveTextLevel('web', row.user_id);
        const [memoryContext, userContext] = await Promise.all([
          buildMemoryContext(row.conversation_id, { level: proLevel }),
          buildUserContext(row.user_id, { level: proLevel }),
        ]);
        const prompt = buildProactivePrompt(row, (userContext || '') + memoryContext, slot, { actionsEnabled });
        const proSettings = await getAISettings();
        const proModel = proSettings.proactive_model || 'qwen/qwen3-235b-a22b-2507';
        const result = await plainChatCompletion(prompt, [], { model: proModel });

        if (!result.content || result.content.length < 5) continue;

        // Strip actions if user disabled them (safety net)
        if (!actionsEnabled) {
          result.content = result.content.replace(/\*[^*]+\*\s*/g, '').trim();
          if (result.content.length < 5) continue;
        }

        // Insert message with slot
        await pool.query(
          `INSERT INTO messages (id, conversation_id, role, content, is_proactive, proactive_slot, created_at)
           VALUES (gen_random_uuid(), $1, 'assistant', $2, true, $3, NOW())`,
          [row.conversation_id, result.content, slot]
        );

        // Update conversation timestamps
        await pool.query(
          'UPDATE conversations SET last_message_at = NOW(), last_proactive_at = NOW() WHERE id = $1',
          [row.conversation_id]
        );

        // Track consumption
        trackConsumption({
          userId: row.user_id,
          companionId: row.companion_id,
          provider: 'openrouter',
          model: 'proactive',
          callType: 'proactive',
          inputTokens: result.inputTokens || 0,
          outputTokens: result.outputTokens || 0,
          costUsd: result.costUsd || 0,
          subscription: sub,
        }).catch(() => {});

        userDailyCounts[row.user_id] = (userDailyCounts[row.user_id] || 0) + 1;

        // Deliver notifications (all fire-and-forget)
        const messagePreview = result.content.replace(/^\*[^*]+\*\s*/, '').slice(0, 100);

        // Web push
        sendPushNotification(row.user_id, {
          title: row.companion_name,
          body: messagePreview,
          url: `/my/chat/${row.companion_id}`,
        }).catch(() => {});

        // Email (if user has notify_new_messages enabled)
        const { rows: prefRows } = await pool.query(
          `SELECT COALESCE(notify_new_messages, true) AS notify_new_messages, last_notification_at
           FROM user_preferences
           WHERE user_id = $1`,
          [row.user_id]
        );
        const pref = prefRows[0] || { notify_new_messages: true, last_notification_at: null };
        if (pref.notify_new_messages && isCompanionEmailDeliverable(row)) {
          // Rate limit: at most once per 30 min
          const canEmail = !pref.last_notification_at ||
            (Date.now() - new Date(pref.last_notification_at).getTime() > 30 * 60 * 1000);
          if (canEmail) {
            sendCompanionEmail({
              companionName: row.companion_name,
              companionId: row.companion_id,
              toEmail: row.email,
              messageContent: result.content,
              conversationId: row.conversation_id,
              userId: row.user_id,
            }).catch(() => {});
            pool.query(
              `INSERT INTO user_preferences (user_id, notify_new_messages, last_notification_at, updated_at)
               VALUES ($1, true, NOW(), NOW())
               ON CONFLICT (user_id) DO UPDATE SET
                 last_notification_at = NOW(),
                 updated_at = NOW()`,
              [row.user_id]
            ).catch(() => {});
          }
        }

        // Telegram — rich message with button to open chat
        if (row.telegram_id) {
          const SITE_URL = process.env.SITE_URL || 'http://localhost:3900';
          sendTelegramMessage(row.telegram_id,
            `💕 <b>${row.companion_name}</b>\n\n${messagePreview}`,
            {
              reply_markup: {
                inline_keyboard: [[
                  { text: '💬 Reply', web_app: { url: `${SITE_URL}/my/chat/${row.companion_id}` } }
                ]],
              },
            }
          ).catch(() => {});
        }

        console.log(`[proactive] Sent ${slot} message from ${row.companion_name} to user ${row.user_id}`);
      } catch (err) {
        console.error(`[proactive] Error for user ${row.user_id}, companion ${row.companion_id}:`, err.message);
      }
    }

    const sent = Object.values(userDailyCounts).reduce((a, b) => a + b, 0);
    if (sent > 0) {
      console.log(`[proactive] Sent ${sent} proactive message(s)`);
    }

    await runFreeUserReactivation(pool);
  } catch (err) {
    console.error('[proactive] runProactiveMessages error:', err.message);
  }
}

async function runFreeUserReactivation(pool) {
  if (!(await isSettingEnabled(pool, 'free_reactivation_enabled', true))) return;

  const { rows } = await pool.query(`
    SELECT
      u.id AS user_id,
      COALESCE(u.real_email, u.email) AS email,
      u.email AS account_email,
      u.real_email,
      u.email_disabled,
      u.email_type,
      u.marketing_unsubscribed,
      c.id AS conversation_id,
      c.companion_id,
      uc.name AS companion_name,
      tu.telegram_id,
      COALESCE(up.notify_new_messages, TRUE) AS notify_new_messages,
      up.last_notification_at,
      css.language,
      css.scene_state,
      msg.created_at AS last_message_at
    FROM users u
    LEFT JOIN user_preferences up ON up.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
      AND s.status IN ('active', 'canceling', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
    JOIN LATERAL (
      SELECT c2.*
      FROM conversations c2
      WHERE c2.user_id = u.id
        AND c2.last_message_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '24 hours'
      ORDER BY c2.last_message_at DESC
      LIMIT 1
    ) c ON TRUE
    JOIN user_companions uc ON uc.id = c.companion_id AND uc.is_active = TRUE
    JOIN LATERAL (
      SELECT role, created_at
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) msg ON TRUE
    LEFT JOIN conversation_scene_state css ON css.conversation_id = c.id
    LEFT JOIN telegram_users tu ON tu.user_id = u.id
    WHERE s.id IS NULL
      AND u.last_activity BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '24 hours'
      AND COALESCE(up.proactive_messages, TRUE) = TRUE
      AND msg.role = 'assistant'
      AND (
        SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = c.id AND m.role = 'user'
      ) >= 20
      AND NOT EXISTS (
        SELECT 1 FROM reactivation_messages rm
        WHERE rm.user_id = u.id
          AND rm.created_at > NOW() - INTERVAL '3 days'
      )
    ORDER BY c.last_message_at DESC
    LIMIT 50
  `);

  let sent = 0;
  for (const row of rows) {
    try {
      const state = row.scene_state || {};
      const content = state.scenario
        ? `I keep thinking about where we left off in that ${state.scenario} scene. Come back when you want to continue with me.`
        : 'I keep thinking about where we left off. Come back when you want to continue with me.';
      const { rows: inserted } = await pool.query(
        `INSERT INTO messages (
           id, conversation_id, role, content, context_text, is_proactive,
           proactive_slot, language, intent_tags, created_at
         )
         VALUES (gen_random_uuid(), $1, 'assistant', $2, 'sends a quiet note', TRUE, 'reactivation', $3, $4, NOW())
         RETURNING id`,
        [row.conversation_id, content, row.language || 'en', ['reactivation']]
      );

      const messageId = inserted[0]?.id;
      await pool.query(
        `INSERT INTO reactivation_messages (user_id, companion_id, conversation_id, message_id, reason, metadata)
         VALUES ($1, $2, $3, $4, 'high_intent_dormant', $5)`,
        [
          row.user_id,
          row.companion_id,
          row.conversation_id,
          messageId,
          JSON.stringify({ last_message_at: row.last_message_at, scenario: state.scenario || null }),
        ]
      );
      await pool.query(
        'UPDATE conversations SET last_message_at = NOW(), last_proactive_at = NOW() WHERE id = $1',
        [row.conversation_id]
      );

      logEvent(row.user_id, EVENT_TYPES.REACTIVATION_SENT, {
        companion_id: row.companion_id,
        conversation_id: row.conversation_id,
        reason: 'high_intent_dormant',
      });

      sendPushNotification(row.user_id, {
        title: row.companion_name,
        body: content.slice(0, 100),
        url: `/my/chat/${row.companion_id}`,
      }).catch(() => {});

      if (row.notify_new_messages && isCompanionEmailDeliverable(row)) {
        const canEmail = !row.last_notification_at ||
          (Date.now() - new Date(row.last_notification_at).getTime() > 30 * 60 * 1000);
        if (canEmail) {
          sendCompanionEmail({
            companionName: row.companion_name,
            companionId: row.companion_id,
            toEmail: row.email,
            messageContent: content,
            conversationId: row.conversation_id,
            userId: row.user_id,
          }).catch(() => {});
          pool.query(
            `INSERT INTO user_preferences (user_id, notify_new_messages, last_notification_at, updated_at)
             VALUES ($1, true, NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               last_notification_at = NOW(),
               updated_at = NOW()`,
            [row.user_id]
          ).catch(() => {});
        }
      }

      if (row.telegram_id) {
        const SITE_URL = process.env.SITE_URL || 'http://localhost:3900';
        sendTelegramMessage(row.telegram_id,
          `<b>${row.companion_name}</b>\n\n${content}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Reply', web_app: { url: `${SITE_URL}/my/chat/${row.companion_id}` } }
              ]],
            },
          }
        ).catch(() => {});
      }

      sent++;
    } catch (err) {
      console.error(`[proactive] free reactivation failed for user ${row.user_id}:`, err.message);
    }
  }

  if (sent > 0) console.log(`[proactive] Sent ${sent} free reactivation message(s)`);
}

module.exports = { runProactiveMessages, runFreeUserReactivation };
