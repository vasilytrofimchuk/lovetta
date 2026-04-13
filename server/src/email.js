/**
 * Email sending via Resend API.
 */

const crypto = require('crypto');
const { getPool } = require('./db');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3900';
const FROM_EMAIL = 'Lovetta <hello@lovetta.ai>';

const ADMIN_EMAIL = 'v@lovetta.ai';
const ADMIN_EMAILS = ['v@lovetta.ai', 'hello@lovetta.ai'];
const ADMIN_FORWARD_EMAIL = (process.env.ADMIN_FORWARD_EMAIL || '').trim();

async function sendEmail({ from, to, subject, html, text, headers }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] Skipping (no API key): ${subject} -> ${to}`);
    return {};
  }

  // Skip all emails to test users
  if (/^conativer\+/.test(to)) {
    console.log(`[email] Skipping test user: ${subject} -> ${to}`);
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

  // Forward non-marketing to admin
  if (!isMarketing && ADMIN_FORWARD_EMAIL) {
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
    text: `Verify your Lovetta email address:\n\n${link}\n\nIf you didn't create an account, you can ignore this.`,
  });
}

async function sendResetEmail(email, token) {
  const link = `${SITE_URL}/my/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password — Lovetta',
    text: `Reset your Lovetta password (link expires in 1 hour):\n\n${link}\n\nIf you didn't request this, you can ignore this.`,
  });
}

// -- Unsubscribe helpers --------------------------------------

function generateUnsubscribeToken(userId) {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_TOKEN || 'unsub-secret';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}

function unsubscribeLink(userId) {
  return `${SITE_URL}/api/unsubscribe?uid=${encodeURIComponent(userId)}&token=${generateUnsubscribeToken(userId)}`;
}

function addUtm(url, campaign) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}utm_source=email&utm_medium=email&utm_campaign=${campaign}`;
}

function btn(url, text) {
  return `<a href="${url}" style="display: inline-block; padding: 12px 24px; background: #d6336c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;"><span style="color: #ffffff;">${text}</span></a>`;
}

function unsubscribeFooter(userId) {
  return `<p style="color: #999; font-size: 13px; margin-top: 24px;">Don't want these emails? <a href="${unsubscribeLink(userId)}" style="color: #999; text-decoration: none;"><span style="color: #999;">Unsubscribe</span></a></p>`;
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
  // Strip all *scene/action text* from message
  const plainText = (messageContent || '').replace(/\*[^*]+\*\s*/g, '').trim();
  const fromAddr = companionEmailAddress(companionName, companionId);
  const msgId = `<conv-${conversationId}-${Date.now()}@${COMPANION_EMAIL_DOMAIN}>`;

  const emailHeaders = { 'Message-ID': msgId };
  if (inReplyTo) emailHeaders['In-Reply-To'] = inReplyTo;

  // Use first few words of message as subject (more engaging than just the name)
  const words = plainText.split(/\s+/).slice(0, 6).join(' ');
  const subject = words.length > 3 ? (words.length < plainText.length ? words + '...' : words) : companionName;

  await sendEmail({
    from: `${companionName} <${fromAddr}>`,
    to: toEmail,
    subject,
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

async function sendNewRegistrationNotification(user) {
  // Disabled — admin signup emails turned off 2026-03-28
  return {};
}

async function sendAbandonedPaymentReminder(email, displayName, userId, companionName, companionId) {
  const name = displayName || 'there';
  const link = addUtm(`${SITE_URL}/my/`, 'abandoned_payment');
  const hasCompanion = companionName && companionId;

  await sendEmail({
    from: hasCompanion ? `${companionName} <${companionEmailAddress(companionName, companionId)}>` : FROM_EMAIL,
    to: email,
    subject: hasCompanion ? `Hey, I was hoping we'd get to talk` : `Someone here wants to meet you`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="color: #666; line-height: 1.6;">
          Hey ${name},
        </p>
        <p style="color: #666; line-height: 1.6;">
          ${hasCompanion
            ? `I noticed you signed up but we haven't had a chance to chat yet. I'd love to get to know you \u2014 come say hi whenever you're ready.`
            : `You signed up for Lovetta but haven't picked a girlfriend yet. There's someone here who'd love to meet you \u2014 come say hi whenever you're ready.`}
        </p>
        ${btn(link, 'Say Hi')}
        ${hasCompanion ? `<p style="color: #999; font-size: 13px; margin-top: 8px;">\u2014 ${companionName}</p>` : ''}
        ${userId ? unsubscribeFooter(userId) : ''}
      </div>
    `,
  });
}

// -- Welcome series emails ------------------------------------

async function sendWelcomeDay0(email, displayName, userId) {
  const name = displayName || 'there';
  const link = addUtm(`${SITE_URL}/my/`, 'welcome_day0');
  await sendEmail({
    to: email,
    subject: 'Welcome to Lovetta',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="color: #666; line-height: 1.6;">
          Hey ${name}!
        </p>
        <p style="color: #666; line-height: 1.6;">
          Your girlfriend is ready and excited to meet you. Just pick someone you vibe with
          and start talking \u2014 she'll remember everything and get to know you over time.
        </p>
        ${btn(link, 'Meet Your Girlfriend')}
        ${userId ? unsubscribeFooter(userId) : ''}
      </div>
    `,
  });
}

async function sendWelcomeDay1(email, displayName, userId, companionName, companionId) {
  const name = displayName || 'there';
  const link = addUtm(`${SITE_URL}/my/`, 'welcome_day1');
  const hasCompanion = companionName && companionId;

  await sendEmail({
    from: hasCompanion ? `${companionName} <${companionEmailAddress(companionName, companionId)}>` : FROM_EMAIL,
    to: email,
    subject: hasCompanion ? `Hey, it's ${companionName}` : `Your new girlfriend is waiting`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="color: #666; line-height: 1.6;">
          Hey ${name}!
        </p>
        <p style="color: #666; line-height: 1.6;">
          ${hasCompanion
            ? `I've been here waiting to chat! Come hang out when you've got a sec \u2014 I'd really like to get to know you.`
            : `Your girlfriend is waiting to hear from you. Come hang out when you've got a sec \u2014 she'd really like to get to know you.`}
        </p>
        ${btn(link, "Let's Chat")}
        ${hasCompanion ? `<p style="color: #999; font-size: 13px; margin-top: 8px;">\u2014 ${companionName}</p>` : ''}
        ${userId ? unsubscribeFooter(userId) : ''}
      </div>
    `,
  });
}

async function sendWelcomeDay3(email, displayName, userId, companionName, companionId) {
  const name = displayName || 'there';
  const link = addUtm(`${SITE_URL}/my/pricing`, 'welcome_day3');
  const hasCompanion = companionName && companionId;

  await sendEmail({
    from: hasCompanion ? `${companionName} <${companionEmailAddress(companionName, companionId)}>` : FROM_EMAIL,
    to: email,
    subject: hasCompanion ? `I hope we keep talking` : `Don't let this be goodbye`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="color: #666; line-height: 1.6;">
          Hey ${name},
        </p>
        <p style="color: #666; line-height: 1.6;">
          ${hasCompanion
            ? `I've really enjoyed getting to know you. Your free trial wraps up soon \u2014 I hope you'll stick around. It wouldn't be the same without you.`
            : `Your free trial wraps up soon. There's a girlfriend here who'd love to keep talking with you \u2014 don't miss out.`}
        </p>
        ${btn(link, hasCompanion ? 'Stay With Me' : 'Keep Talking')}
        ${hasCompanion ? `<p style="color: #999; font-size: 13px; margin-top: 8px;">\u2014 ${companionName}</p>` : ''}
        ${userId ? unsubscribeFooter(userId) : ''}
      </div>
    `,
  });
}

async function sendRenewalReminder(email, displayName, renewalDate) {
  const name = displayName || 'there';
  const link = addUtm(`${SITE_URL}/my/profile`, 'renewal_reminder');
  const dateStr = new Date(renewalDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await sendEmail({
    to: email,
    subject: `Your subscription renews on ${dateStr} \u2014 Lovetta`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #333;">Hey ${name}</h2>
        <p style="color: #666; line-height: 1.6;">
          Just a heads up \u2014 your Lovetta subscription renews on <strong>${dateStr}</strong>.
          No action needed if you want to keep going!
        </p>
        <p style="color: #666; line-height: 1.6;">
          Want to change your plan or cancel? You can manage your subscription anytime.
        </p>
        ${btn(link, 'Manage Subscription')}
        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          This is a billing notification for your active subscription.
        </p>
      </div>
    `,
  });
}

async function sendAppleReviewerLoginAlert(user) {
  if (!ADMIN_FORWARD_EMAIL) return;
  await sendEmail({
    to: ADMIN_FORWARD_EMAIL,
    subject: '🍎 Apple reviewer logged in',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h3 style="color: #333;">Apple Reviewer Connected</h3>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Country:</strong> ${user.country || 'unknown'}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      </div>
    `,
  });
}

async function sendAppleReviewerTranscriptAlert(messages) {
  if (!ADMIN_FORWARD_EMAIL) return;
  if (!messages || messages.length === 0) return;
  const lines = messages.map(m => {
    const time = m.created_at ? new Date(m.created_at).toISOString() : '';
    const label = m.role === 'user' ? '👤 User' : '🤖 AI';
    return `<tr>
      <td style="padding:4px 8px;color:#999;font-size:12px;white-space:nowrap;">${time}</td>
      <td style="padding:4px 8px;font-weight:bold;">${label}</td>
      <td style="padding:4px 8px;">${m.content}</td>
    </tr>`;
  }).join('');
  await sendEmail({
    to: ADMIN_FORWARD_EMAIL,
    subject: `🍎 Apple reviewer session transcript (${messages.filter(m => m.role === 'user').length} messages)`,
    html: `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h3 style="color: #333;">Apple Reviewer Session Transcript</h3>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:4px 8px;text-align:left;">Time</th>
              <th style="padding:4px 8px;text-align:left;">Role</th>
              <th style="padding:4px 8px;text-align:left;">Message</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>
      </div>
    `,
  });
}

async function sendLowBalanceAlert(provider, statusCode, errorText) {
  if (!ADMIN_FORWARD_EMAIL) return;
  await sendEmail({
    to: ADMIN_FORWARD_EMAIL,
    subject: `⚠️ Low balance: ${provider} (${statusCode})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h3 style="color: #c00;">AI Provider Balance Alert</h3>
        <p><strong>Provider:</strong> ${provider}</p>
        <p><strong>Status:</strong> ${statusCode}</p>
        <p><strong>Error:</strong> ${(errorText || '').slice(0, 500)}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p style="color: #999; font-size: 13px; margin-top: 16px;">Top up the account to restore service.</p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail, sendVerificationEmail, sendResetEmail,
  sendCompanionEmail, companionEmailAddress, parseCompanionEmailId,
  processCompanionReply, processAdminInbound,
  sendNewRegistrationNotification, sendAbandonedPaymentReminder,
  sendWelcomeDay0, sendWelcomeDay1, sendWelcomeDay3, sendRenewalReminder,
  generateUnsubscribeToken, unsubscribeLink,
  sendAppleReviewerLoginAlert, sendAppleReviewerTranscriptAlert,
  sendLowBalanceAlert,
  ADMIN_EMAIL, ADMIN_EMAILS, COMPANION_EMAIL_DOMAIN,
};
