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

module.exports = { sendEmail, sendVerificationEmail, sendResetEmail, processAdminInbound, ADMIN_EMAIL, ADMIN_EMAILS };
