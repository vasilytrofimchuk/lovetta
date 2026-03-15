const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

test.describe('Lead capture', () => {
  test('accepts valid 18+ lead', async ({ request }) => {
    const res = await request.post(`${BASE}/api/leads`, {
      data: {
        email: `test_${Date.now()}@example.com`,
        birthMonth: 6,
        birthYear: 2000,
        sessionId: null,
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('rejects underage user', async ({ request }) => {
    const res = await request.post(`${BASE}/api/leads`, {
      data: {
        email: 'young@example.com',
        birthMonth: 1,
        birthYear: 2015,
        sessionId: null,
      },
    });
    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('age_restricted');
  });

  test('rejects invalid email', async ({ request }) => {
    const res = await request.post(`${BASE}/api/leads`, {
      data: {
        email: 'not-an-email',
        birthMonth: 6,
        birthYear: 2000,
        sessionId: null,
      },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_email');
  });

  test('rejects invalid birth month', async ({ request }) => {
    const res = await request.post(`${BASE}/api/leads`, {
      data: {
        email: 'test@example.com',
        birthMonth: 13,
        birthYear: 2000,
        sessionId: null,
      },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_birth_month');
  });

  test('enriches lead with visitor session data', async ({ request }) => {
    const sid = 'sess_lead_enrich_' + Date.now() + '_abc123';

    // Track visitor first
    await request.post(`${BASE}/api/track-visitor`, {
      data: {
        sessionId: sid,
        page: '/',
        deviceType: 'Mobile',
        utmSource: 'instagram',
        utmMedium: 'social',
      },
    });

    // Submit lead with same session
    const res = await request.post(`${BASE}/api/leads`, {
      data: {
        email: `enriched_${Date.now()}@example.com`,
        birthMonth: 3,
        birthYear: 1995,
        sessionId: sid,
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
