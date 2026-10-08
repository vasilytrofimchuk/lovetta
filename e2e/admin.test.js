const { test, expect } = require('@playwright/test');
const { BASE, adminHeaders } = require('./helpers');

test.describe('Admin API', () => {
  test('rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/stats`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/stats returns data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/stats`, {
      headers: adminHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.visitors).toBeDefined();
    expect(data.countries).toBeDefined();
  });

  test('GET /api/admin/settings returns settings', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/settings`, {
      headers: adminHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.settings).toBeDefined();
    expect(data.settings.text_level_web).toBeDefined();
  });

  test('GET /api/admin/chat-insights returns aggregate data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/chat-insights?days=7`, {
      headers: adminHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.topics)).toBeTruthy();
    expect(Array.isArray(data.languages)).toBeTruthy();
    expect(data.summary.user_messages).toBeDefined();
  });

  test('PUT /api/admin/settings updates a setting', async ({ request }) => {
    const res = await request.put(`${BASE}/api/admin/settings`, {
      headers: adminHeaders(),
      data: { key: 'text_level_web', value: 3 },
    });
    expect(res.ok()).toBeTruthy();

    // Verify
    const getRes = await request.get(`${BASE}/api/admin/settings`, {
      headers: adminHeaders(),
    });
    const data = await getRes.json();
    expect(data.settings.text_level_web).toBe(3);
  });
});

test.describe('Admin dashboard UI', () => {
  test('shows auth gate', async ({ page }) => {
    await page.goto(`${BASE}/admin.html`);
    await expect(page.locator('#auth-gate')).toBeVisible();
    await expect(page.locator('#token-input')).toBeVisible();
  });
});

test.describe('Admin API: granted subscription', () => {
  const { createTestUser } = require('./helpers');

  test('a grant gives access for N months and a second one extends it', async ({ request }) => {
    const user = await createTestUser(request);
    const grant = (months, reason = 'support compensation') => request.post(
      `${BASE}/api/admin/users/${user.userId}/grant-subscription`,
      { headers: adminHeaders(), data: { months, reason, grantedBy: 'e2e' } }
    );

    const first = await grant(12);
    expect(first.ok(), await first.text()).toBeTruthy();
    const a = (await first.json()).subscription;
    expect(a.paymentProvider).toBe('gift');
    const months = (iso) => (new Date(iso) - Date.now()) / (30.44 * 86400000);
    expect(months(a.currentPeriodEnd)).toBeGreaterThan(11.5);
    expect(months(a.currentPeriodEnd)).toBeLessThan(12.5);

    const status = await (await request.get(`${BASE}/api/billing/status`, { headers: user.authHeaders })).json();
    expect(status).toMatchObject({ hasSubscription: true, paymentProvider: 'gift', status: 'active' });

    const b = (await (await grant(3)).json()).subscription;
    expect(b.id, 'the same row is extended, not a second gift').toBe(a.id);
    expect(months(b.currentPeriodEnd)).toBeGreaterThan(14.5);
  });

  test('a grant needs a reason, a sane length and a real user', async ({ request }) => {
    const user = await createTestUser(request);
    const post = (id, data) => request.post(`${BASE}/api/admin/users/${id}/grant-subscription`, { headers: adminHeaders(), data });
    expect((await post(user.userId, { months: 12 })).status()).toBe(400);
    expect((await post(user.userId, { months: 0, reason: 'x' })).status()).toBe(400);
    expect((await post(user.userId, { months: 120, reason: 'x' })).status()).toBe(400);
    expect((await post('00000000-0000-0000-0000-00000000dead', { months: 1, reason: 'x' })).status()).toBe(400);
    expect((await request.post(`${BASE}/api/admin/users/${user.userId}/grant-subscription`, { data: { months: 1, reason: 'x' } })).status()).toBe(401);
  });
});
