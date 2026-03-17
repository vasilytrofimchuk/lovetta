/**
 * Email sending via Resend API.
 */

const { getPool } = require('./db');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3900';
const FROM_EMAIL = 'Lovetta <hello@lovetta.ai>';

const ADMIN_EMAIL = 'v@lovetta.ai';
const ADMIN_EMAILS = ['v@lovetta.ai', 'hello@lovetta.ai'];
const ADMIN_FORWARD_EMAIL = process.env.ADMIN_FORWARD_EMAIL || 'vasilytrofimchuk@gmail.com';

async function sendEmail({ from, to, subject, html, text, headers }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] Skipping (no API key): ${subject} -> ${to}`);
    return {};
  }

  try {
    const payload = { from: from || FROM_EMAIL, to, subject };
    if (html) payload.html = html;
    if (text) payload.text = text;
    if (headers) payload.headers = headers;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[email] Resend error:', err);
      return {};
    }

    return await res.json();
  } catch (err) {
    console.error('[email] Send failed:', err.message);
    return {};
  }
}

/**
 * Process inbound email to v@lovetta.ai / hello@lovetta.ai — store in admin_emails,
 * forward non-marketing to personal Gmail.
 */
async function processAdminInbound({ from, to, cc, subject, text, html, headers }) {
  const pool = getPool();
  if (!pool) return;

  const fromAddr = typeof from === 'object' ? (from.address || from.email || String(from)) : String(from || '');
  const toAddr = typeof to === 'object' ? (to.address || to.email || String(to)) : String(to || '');
  const bodyText = text || '';
  const bodyHtml = html || '';

  // Detect marketing emails
  const combined = (bodyText + bodyHtml).toLowerCase();
  const isMarketing = combined.includes('unsubscribe');

  // Extract message-id and in-reply-to from headers
  const hdrs = headers || {};
  const messageId = hdrs['message-id'] || hdrs['Message-ID'] || hdrs['Message-Id'] || null;
  const inReplyTo = hdrs['in-reply-to'] || hdrs['In-Reply-To'] || null;

  const { rows } = await pool.query(
    `INSERT INTO admin_emails (direction, from_address, to_address, subject, body_text, body_html, message_id, in_reply_to, headers, is_marketing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    ['inbound', fromAddr, toAddr, subject || '(no subject)', bodyText, bodyHtml, messageId, inReplyTo, JSON.stringify(hdrs), isMarketing]
  );

  console.log(`[email] Admin inbound email #${rows[0].id} from=${fromAddr} marketing=${isMarketing}`);

  // Forward non-marketing to personal Gmail
  if (!isMarketing) {
    try {
      await sendEmail({
        from: `Lovetta Forwarded <${ADMIN_EMAIL}>`,
        to: ADMIN_FORWARD_EMAIL,
        subject: `Fwd: ${subject || '(no subject)'}`,
        text: `--- Forwarded from ${fromAddr} ---\n\n${bodyText}`,
        html: bodyHtml || undefined,
      });
      await pool.query('UPDATE admin_emails SET forwarded = true WHERE id = $1', [rows[0].id]);
      console.log(`[email] Forwarded admin email #${rows[0].id} to Gmail`);
    } catch (err) {
      console.error(`[email] Forward failed for #${rows[0].id}: ${err.message}`);
    }
  }
}

async function sendVerificationEmail(email, token) {
  const link = `${SITE_URL}/my/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Verify your email — Lovetta',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #333;">Welcome to Lovetta</h2>
        <p style="color: #666; line-height: 1.6;">
          Click the button below to verify your email address.
        </p>
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #ec4899; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendResetEmail(email, token) {
  const link = `${SITE_URL}/my/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password — Lovetta',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #333;">Reset your password</h2>
        <p style="color: #666; line-height: 1.6;">
          Click the button below to reset your password. This link expires in 1 hour.
        </p>
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #ec4899; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

// -- Companion email system -----------------------------------

const COMPANION_EMAIL_DOMAIN = process.env.COMPANION_EMAIL_DOMAIN || 'lovetta.email';

/**
 * Generate a deterministic email address for a companion.
 * e.g. luna.a3b2c1@lovetta.email
 */
function companionEmailAddress(name, companionId) {
  const slug = (name || 'girl').toLowerCase().replace(/[^a-z]/g, '') || 'girl';
  const short = (companionId || '').replace(/-/g, '').slice(0, 6);
  return `${slug}.${short}@${COMPANION_EMAIL_DOMAIN}`;
}

/**
 * Parse companion identifier from an email address like luna.a3b2c1@lovetta.email.
 * Returns the 6-char hex short ID.
 */
function parseCompanionEmailId(address) {
  const addr = typeof address === 'object' ? (address.address || address.email || String(address)) : String(address || '');
  const match = addr.match(/^([a-z]+)\.([a-f0-9]{6})@/i);
  return match ? match[2].toLowerCase() : null;
}

/**
 * Send a message from a companion to a user via email.
 * Returns the Message-ID for threading.
 */
async function sendCompanionEmail({ companionName, companionId, toEmail, messageContent, conversationId, inReplyTo }) {
  // Strip *context text* prefix from message
  const plainText = (messageContent || '').replace(/^\*[^*]+\*\s*/, '');
  const fromAddr = companionEmailAddress(companionName, companionId);
  const msgId = `<conv-${conversationId}-${Date.now()}@${COMPANION_EMAIL_DOMAIN}>`;

  const emailHeaders = { 'Message-ID': msgId };
  if (inReplyTo) emailHeaders['In-Reply-To'] = inReplyTo;

  await sendEmail({
    from: `${companionName} <${fromAddr}>`,
    to: toEmail,
    subject: `${companionName}`,
    text: plainText,
    html: `<p>${plainText.replace(/\n/g, '<br>')}</p>`,
    headers: emailHeaders,
  });

  return msgId;
}

/**
 * Process an inbound reply to a companion email address.
 * Looks up the companion, inserts user message, gets AI response, emails it back.
 */
async function processCompanionReply({ from, to, subject, text, html, headers }) {
  const pool = getPool();
  if (!pool) return;

  const fromAddr = typeof from === 'object' ? (from.address || from.email || String(from)) : String(from || '');
  const toAddr = typeof to === 'object' ? (to.address || to.email || String(to)) : String(to || '');

  // Parse companion short ID from "to" address
  const shortId = parseCompanionEmailId(toAddr);
  if (!shortId) {
    console.warn(`[email] Could not parse companion ID from ${toAddr}`);
    return;
  }

  // Find user by email (from address)
  const userEmail = fromAddr.replace(/^.*</, '').replace(/>.*$/, '').trim().toLowerCase();
  const { rows: userRows } = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = $1', [userEmail]
  );
  if (!userRows[0]) {
    console.warn(`[email] No user found for email ${userEmail}`);
    return;
  }
  const userId = userRows[0].id;

  // Find companion by short ID prefix match
  const { rows: compRows } = await pool.query(
    `SELECT id, name, personality, backstory, traits, communication_style, age
     FROM user_companions
     WHERE user_id = $1 AND REPLACE(id::text, '-', '') LIKE $2 || '%' AND is_active = TRUE`,
    [userId, shortId]
  );
  if (!compRows[0]) {
    console.warn(`[email] No companion found for user=${userId} shortId=${shortId}`);
    return;
  }
  const companion = compRows[0];

  // Get or create conversation
  await pool.query(
    'INSERT INTO conversations (user_id, companion_id) VALUES ($1, $2) ON CONFLICT (user_id, companion_id) DO NOTHING',
    [userId, companion.id]
  );
  const { rows: convRows } = await pool.query(
    'SELECT id, last_email_message_id FROM conversations WHERE user_id = $1 AND companion_id = $2',
    [userId, companion.id]
  );
  if (!convRows[0]) return;
  const conversation = convRows[0];

  // Extract reply text — strip quoted content (lines starting with >)
  let replyText = (text || '').split('\n').filter(l => !l.startsWith('>')).join('\n').trim();
  // Also try to strip "On ... wrote:" blocks
  replyText = replyText.replace(/On .+wrote:\s*$/s, '').trim();
  if (!replyText) {
    console.warn('[email] Empty reply text, skipping');
    return;
  }

  console.log(`[email] Companion reply: user=${userId} companion=${companion.name} text="${replyText.slice(0, 80)}"`);

  // Log inbound companion email
  const companionAddr = companionEmailAddress(companion.name, companion.id);
  try {
    await pool.query(
      `INSERT INTO companion_emails (user_id, companion_id, direction, from_address, to_address, subject, body_text, message_id)
       VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7)`,
      [userId, companion.id, userEmail, companionAddr, subject || null, replyText, (headers || {})['message-id'] || null]
    );
  } catch (e) { console.warn('[email] Failed to log inbound companion email:', e.message); }

  // Insert user message
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [conversation.id, replyText]
  );
  await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

  // Build system prompt and get AI response
  const { chatCompletion, buildSystemPrompt } = require('./ai');
  const { detectPlatform } = require('./content-levels');

  const traits = Array.isArray(companion.traits) ? companion.traits.join(', ') : '';
  const systemPrompt = `You are ${companion.name}, a ${companion.age}-year-old woman.

${companion.personality}

${companion.backstory ? companion.backstory + '\n' : ''}Communication style: ${companion.communication_style}
${traits ? 'Traits: ' + traits : ''}

Response format: Always start with a brief action or emotional context in *asterisks*, then your message.
Example: *leans closer with a playful smile* Hey, I was just thinking about you...

Stay in character at all times. Be engaging, expressive, and emotionally present. Remember details the user shares.
This conversation is happening via email. Keep responses natural but don't mention email explicitly.`;

  // Load memory context + recent messages
  const { buildMemoryContext, processMemory } = require('./memory');
  const memoryContext = await buildMemoryContext(conversation.id);
  const fullSystemPrompt = systemPrompt + memoryContext;

  const { rows: recentMessages } = await pool.query(
    `SELECT role, content FROM messages WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [conversation.id]
  );
  recentMessages.reverse();
  const aiMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));

  let aiResult;
  try {
    aiResult = await chatCompletion(fullSystemPrompt, aiMessages, {
      userId,
      companionId: companion.id,
      platform: 'web',
    });
  } catch (err) {
    console.error('[email] AI response error:', err.message);
    return;
  }

  if (!aiResult || !aiResult.content) return;

  // Parse and save assistant message
  const match = aiResult.content.match(/^\*([^*]+)\*/);
  const contextText = match ? match[1].trim() : null;
  const content = match ? aiResult.content.slice(match[0].length).trim() : aiResult.content;

  await pool.query(
    'INSERT INTO messages (conversation_id, role, content, context_text) VALUES ($1, $2, $3, $4)',
    [conversation.id, 'assistant', content, contextText]
  );
  await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);

  // Fire-and-forget memory processing
  processMemory(pool, conversation.id, companion.id, userId).catch(err => {
    console.warn('[memory] email processing error:', err.message);
  });

  // Send AI response back as email
  const hdrs = headers || {};
  const userMsgId = hdrs['message-id'] || hdrs['Message-ID'] || hdrs['Message-Id'] || null;

  const sentMsgId = await sendCompanionEmail({
    companionName: companion.name,
    companionId: companion.id,
    toEmail: userEmail,
    messageContent: aiResult.content,
    conversationId: conversation.id,
    inReplyTo: userMsgId,
  });

  // Log outbound companion email
  try {
    await pool.query(
      `INSERT INTO companion_emails (user_id, companion_id, direction, from_address, to_address, subject, body_text, message_id)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7)`,
      [userId, companion.id, companionAddr, userEmail, companion.name, (aiResult.content || '').replace(/^\*[^*]+\*\s*/, ''), sentMsgId]
    );
  } catch (e) { console.warn('[email] Failed to log outbound companion email:', e.message); }

  // Store message ID for future threading
  await pool.query(
    'UPDATE conversations SET last_email_message_id = $2 WHERE id = $1',
    [conversation.id, sentMsgId]
  );

  console.log(`[email] Sent companion reply: ${companion.name} -> ${userEmail}`);
}

module.exports = {
  sendEmail, sendVerificationEmail, sendResetEmail,
  sendCompanionEmail, companionEmailAddress, parseCompanionEmailId,
  processCompanionReply, processAdminInbound,
  ADMIN_EMAIL, ADMIN_EMAILS, COMPANION_EMAIL_DOMAIN,
};
