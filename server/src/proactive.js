/**
 * Proactive messaging — companions reach out with morning, evening, and random messages.
 * Runs every 30 min via scheduler. Timezone-aware with user-configurable frequency.
 */

const { getPool } = require('./db');
const { plainChatCompletion } = require('./ai');
const { buildMemoryContext } = require('./memory');
const { sendCompanionEmail } = require('./email');
const { sendPushNotification } = require('./push');
const { sendMessage: sendTelegramMessage } = require('./telegram');
const { getUserSubscription } = require('./billing');
const { trackConsumption, checkMediaBlocked } = require('./consumption');

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
function buildProactivePrompt(companion, memoryContext, slot) {
  const slotInstructions = {
    morning: `It's morning. Send a sweet "good morning" message — like you just woke up and he's the first thing on your mind. Be cozy and warm.`,
    evening: `It's evening. Send a relaxed message — like you're winding down and thinking of him. Be flirty and intimate.`,
    random: `You haven't heard from your boyfriend in a while. Send him a short, natural message — like you're thinking of him.`,
  };

  return `You are ${companion.name}, a ${companion.age || 22}-year-old woman.
${companion.personality || ''}
${companion.backstory || ''}
Communication style: ${companion.communication_style || 'warm and playful'}

${slotInstructions[slot] || slotInstructions.random}
Keep it 1-3 sentences. Be warm and in-character. Don't ask too many questions. Just reach out naturally.
Only reference topics actually discussed — never invent or assume details about their life.

Start with a brief action in *asterisks*, then your message.
Example: *curls up on the couch and texts you* Hey... I was just thinking about you. How's your day going?

${memoryContext || ''}`;
}

/**
 * Main scheduler function — find inactive users and send proactive messages.
 */
async function runProactiveMessages() {
  const pool = getPool();
  if (!pool) return;

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
        u.email_disabled, u.email_type,
        c.id AS conversation_id, c.companion_id, c.last_proactive_at,
        uc.name AS companion_name, uc.personality, uc.backstory,
        uc.traits, uc.communication_style, uc.age,
        tu.telegram_id,
        up.proactive_frequency
      FROM users u
      JOIN user_preferences up ON up.user_id = u.id
      JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'canceling', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
      JOIN conversations c ON c.user_id = u.id
      JOIN user_companions uc ON uc.id = c.companion_id AND uc.is_active = true
      LEFT JOIN telegram_users tu ON tu.user_id = u.id
      WHERE u.last_activity < NOW() - INTERVAL '${INACTIVITY_HOURS} hours'
        AND up.proactive_messages = true
        AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at ASC
      LIMIT 100
    `);

    if (!candidates.length) return;

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

        // Generate proactive message
        const memoryContext = await buildMemoryContext(row.conversation_id);
        const prompt = buildProactivePrompt(row, memoryContext, slot);
        const result = await plainChatCompletion(prompt, []);

        if (!result.content || result.content.length < 5) continue;

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
          `SELECT notify_new_messages, last_notification_at FROM user_preferences WHERE user_id = $1`,
          [row.user_id]
        );
        const pref = prefRows[0];
        if (pref?.notify_new_messages && row.email && !row.email_disabled && row.email_type !== 'synthetic') {
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
            }).catch(() => {});
            pool.query(
              'UPDATE user_preferences SET last_notification_at = NOW() WHERE user_id = $1',
              [row.user_id]
            ).catch(() => {});
          }
        }

        // Telegram
        if (row.telegram_id) {
          sendTelegramMessage(row.telegram_id, `${row.companion_name}: ${messagePreview}`)
            .catch(() => {});
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
  } catch (err) {
    console.error('[proactive] runProactiveMessages error:', err.message);
  }
}

module.exports = { runProactiveMessages };
