/**
 * Proactive messaging — companions reach out when users are inactive.
 * Runs every 30 min via scheduler. Generates natural "thinking of you" messages.
 */

const { getPool } = require('./db');
const { plainChatCompletion } = require('./ai');
const { buildMemoryContext } = require('./memory');
const { sendCompanionEmail } = require('./email');
const { sendPushNotification } = require('./push');
const { sendMessage: sendTelegramMessage } = require('./telegram');
const { getUserSubscription } = require('./billing');
const { trackConsumption, checkMediaBlocked } = require('./consumption');

const MAX_PER_COMPANION_PER_DAY = 1;
const MAX_PER_USER_PER_DAY = 3;
const INACTIVITY_HOURS = 4;

/**
 * Build a prompt for generating a proactive companion message.
 */
function buildProactivePrompt(companion, memoryContext) {
  return `You are ${companion.name}, a ${companion.age || 22}-year-old woman.
${companion.personality || ''}
${companion.backstory || ''}
Communication style: ${companion.communication_style || 'warm and playful'}

You haven't heard from your boyfriend in a while. Send him a short, natural message — like you're thinking of him.
Keep it 1-3 sentences. Be warm and in-character. Don't ask too many questions. Just reach out naturally.

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
    // - User inactive 4+ hours
    // - Has active subscription
    // - Opted in to proactive messages
    // - Conversation exists with at least one message
    // - No proactive message in last 24h for this companion
    const { rows: candidates } = await pool.query(`
      SELECT
        u.id AS user_id, u.email, u.display_name,
        c.id AS conversation_id, c.companion_id,
        uc.name AS companion_name, uc.personality, uc.backstory,
        uc.traits, uc.communication_style, uc.age,
        tu.telegram_id
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
        AND (c.last_proactive_at IS NULL OR c.last_proactive_at < NOW() - INTERVAL '24 hours')
        AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at ASC
      LIMIT 100
    `);

    if (!candidates.length) return;

    // Track per-user counts for daily rate limit
    const userDailyCounts = {};

    for (const row of candidates) {
      try {
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

        // Check per-companion daily limit
        const { rows: compCount } = await pool.query(
          `SELECT COUNT(*)::int AS count FROM messages
           WHERE conversation_id = $1 AND is_proactive = true AND created_at > CURRENT_DATE`,
          [row.conversation_id]
        );
        if ((compCount[0]?.count || 0) >= MAX_PER_COMPANION_PER_DAY) continue;

        // Skip if user exceeded tip threshold (media blocked = cost too high)
        const sub = await getUserSubscription(row.user_id);
        const blocked = await checkMediaBlocked(row.user_id, sub);
        if (blocked) continue;

        // Generate proactive message
        const memoryContext = await buildMemoryContext(row.conversation_id);
        const prompt = buildProactivePrompt(row, memoryContext);
        const result = await plainChatCompletion(prompt, []);

        if (!result.content || result.content.length < 5) continue;

        // Insert message
        const { rows: msgRows } = await pool.query(
          `INSERT INTO messages (id, conversation_id, role, content, is_proactive, created_at)
           VALUES (gen_random_uuid(), $1, 'assistant', $2, true, NOW())
           RETURNING id`,
          [row.conversation_id, result.content]
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

        // Email (if user has notify_new_messages enabled — checked via existing pref)
        const { rows: prefRows } = await pool.query(
          `SELECT notify_new_messages, last_notification_at FROM user_preferences WHERE user_id = $1`,
          [row.user_id]
        );
        const pref = prefRows[0];
        if (pref?.notify_new_messages && row.email) {
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

        console.log(`[proactive] Sent message from ${row.companion_name} to user ${row.user_id}`);
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
