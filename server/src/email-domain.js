/**
 * Does the domain of an email address have anywhere to deliver mail?
 *
 * A typo such as `name@icloud.comjohn` passes the format check, the app then
 * mails it, and every message bounces with "550 Invalid domain". This asks DNS
 * before the account is created.
 *
 * Only a definite "this domain does not exist" answer rejects an address. A DNS
 * failure or a timeout lets it through — a network hiccup must not lock real
 * people out.
 */

const dns = require('dns').promises;

const TIMEOUT_MS = 3000;
// The resolver's way of saying "no such domain" / "the domain has no such record".
const MISSING = new Set(['ENOTFOUND', 'ENODATA']);
// Reserved names that can never receive mail (RFC 2606 / RFC 6761).
const RESERVED_TLDS = new Set(['invalid', 'test', 'example', 'localhost']);

const EMAIL_DOMAIN_ERROR = "This email domain doesn't exist — check for a typo";

function domainOf(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 0) return '';
  return s.slice(at + 1).replace(/\.$/, '');
}

/** 'yes' — records found, 'no' — definitely none, 'unknown' — DNS did not answer. */
async function lookup(fn) {
  try {
    const records = await fn();
    return Array.isArray(records) && records.length > 0 ? { state: 'yes', records } : { state: 'no' };
  } catch (err) {
    return { state: MISSING.has(err && err.code) ? 'no' : 'unknown', code: err && err.code };
  }
}

async function check(domain, resolver) {
  const mx = await lookup(() => resolver.resolveMx(domain));
  if (mx.state === 'unknown') return true;
  if (mx.state === 'yes') {
    // A single "." exchange is a null MX (RFC 7505): the domain accepts no mail.
    const usable = mx.records.filter((r) => r && r.exchange && r.exchange !== '.');
    return usable.length > 0;
  }
  // The name itself does not exist — there is no address record to fall back on.
  if (mx.code === 'ENOTFOUND') return false;
  // No MX: mail falls back to the address record, if the domain has one.
  const [a, aaaa] = await Promise.all([
    lookup(() => resolver.resolve4(domain)),
    lookup(() => resolver.resolve6(domain)),
  ]);
  return !(a.state === 'no' && aaaa.state === 'no');
}

/**
 * @returns {Promise<boolean>} false only when the domain certainly cannot receive mail.
 */
async function emailDomainExists(email, opts = {}) {
  const domain = domainOf(email);
  if (!domain) return false;
  if (RESERVED_TLDS.has(domain.split('.').pop())) return false;

  // Tests do not query live DNS unless they pass their own resolver.
  if (!opts.resolver && process.env.NODE_ENV === 'test') return true;

  const resolver = opts.resolver || dns;
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeoutMs); });
  try {
    return await Promise.race([check(domain, resolver).catch(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { emailDomainExists, domainOf, EMAIL_DOMAIN_ERROR };
