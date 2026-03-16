/**
 * Email sending via Resend API.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3900';
const FROM_EMAIL = 'Lovetta <hello@lovetta.ai>';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] Skipping (no API key): ${subject} -> ${to}`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[email] Resend error:', err);
    }
  } catch (err) {
    console.error('[email] Send failed:', err.message);
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
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #e040a0; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
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
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #e040a0; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendResetEmail };
