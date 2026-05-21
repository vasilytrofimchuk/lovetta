/**
 * Shared guards for user-facing companion emails.
 */

function normalizedEmail(row = {}) {
  return String(row.email || row.to_email || '').trim().toLowerCase();
}

function isTestEmail(email) {
  return email.startsWith('conativer+') ||
    email === 'conativer@gmail.com' ||
    email.includes('@example.') ||
    email.includes('@test.');
}

function isRelayEmail(email) {
  return email.endsWith('@telegram.lovetta.ai') ||
    email.endsWith('@apple.lovetta.ai');
}

function isCompanionEmailDeliverable(row = {}) {
  const email = normalizedEmail(row);
  if (!email) return false;
  if (row.email_disabled || row.marketing_unsubscribed) return false;
  if (isTestEmail(email) || isRelayEmail(email)) return false;

  const realEmail = String(row.real_email || '').trim().toLowerCase();
  const isUsingRealEmail = realEmail && email === realEmail;
  if (row.email_type === 'synthetic' && !isUsingRealEmail) return false;

  return true;
}

module.exports = { isCompanionEmailDeliverable };
