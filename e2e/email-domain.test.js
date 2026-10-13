const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');
const { emailDomainExists } = require('../server/src/email-domain');

// A stand-in for DNS: each record type either returns rows or fails with a code.
function fakeDns({ mx, a, aaaa }) {
  const answer = (v) => async () => {
    if (typeof v === 'string') { const e = new Error(v); e.code = v; throw e; }
    if (v === 'hang') return new Promise(() => {});
    return v;
  };
  return { resolveMx: answer(mx), resolve4: answer(a), resolve6: answer(aaaa) };
}

test.describe('Email domain check', () => {
  test('a domain with a mail server is accepted', async () => {
    const resolver = fakeDns({ mx: [{ exchange: 'mx.example.org', priority: 10 }] });
    expect(await emailDomainExists('a@real.org', { resolver })).toBe(true);
  });

  test('a domain that does not exist is rejected', async () => {
    const resolver = fakeDns({ mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND' });
    expect(await emailDomainExists('hevin@icloud.comhevinilhan', { resolver })).toBe(false);
  });

  test('no mail server but an address record is accepted', async () => {
    const resolver = fakeDns({ mx: 'ENODATA', a: ['203.0.113.7'], aaaa: 'ENODATA' });
    expect(await emailDomainExists('a@host-only.org', { resolver })).toBe(true);
  });

  test('no mail server and no address record is rejected', async () => {
    const resolver = fakeDns({ mx: 'ENODATA', a: 'ENODATA', aaaa: 'ENODATA' });
    expect(await emailDomainExists('a@empty.org', { resolver })).toBe(false);
  });

  test('a domain that refuses all mail (null MX) is rejected', async () => {
    const resolver = fakeDns({ mx: [{ exchange: '', priority: 0 }] });
    expect(await emailDomainExists('a@nomail.org', { resolver })).toBe(false);
  });

  test('a DNS failure lets the address through', async () => {
    const resolver = fakeDns({ mx: 'ESERVFAIL' });
    expect(await emailDomainExists('a@real.org', { resolver })).toBe(true);
    const half = fakeDns({ mx: 'ENODATA', a: 'ETIMEOUT', aaaa: 'ENODATA' });
    expect(await emailDomainExists('a@real.org', { resolver: half })).toBe(true);
  });

  test('a DNS timeout lets the address through', async () => {
    const resolver = fakeDns({ mx: 'hang' });
    expect(await emailDomainExists('a@slow.org', { resolver, timeoutMs: 50 })).toBe(true);
  });

  test('signup with a domain that cannot exist is refused and creates no account', async ({ request }) => {
    const email = `conativer+dead_${Date.now()}@icloud.invalid`;
    const res = await request.post(`${BASE}/api/auth/signup`, { data: { email, password: 'TestPassword123!', birthMonth: 6, birthYear: 1995, termsAccepted: true, privacyAccepted: true, aiConsentAccepted: true } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("doesn't exist");
    const login = await request.post(`${BASE}/api/auth/login`, { data: { email, password: 'TestPassword123!' } });
    expect(login.status()).toBe(401);
  });
});
