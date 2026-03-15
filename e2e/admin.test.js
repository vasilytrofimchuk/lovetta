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
    expect(data.leads).toBeDefined();
    expect(data.countries).toBeDefined();
  });

  test('GET /api/admin/leads returns paginated list', async ({ request }) => {
    // Create a lead first
    await request.post(`${BASE}/api/leads`, {
      data: {
        email: `admin_test_${Date.now()}@example.com`,
        birthMonth: 1,
        birthYear: 1990,
      },
    });

    const res = await request.get(`${BASE}/api/admin/leads?page=1&limit=10`, {
      headers: adminHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.leads).toBeDefined();
    expect(Array.isArray(data.leads)).toBe(true);
    expect(data.total).toBeGreaterThan(0);
    expect(data.page).toBe(1);
  });

  test('GET /api/admin/leads supports search', async ({ request }) => {
    const unique = `searchtest_${Date.now()}@example.com`;
    await request.post(`${BASE}/api/leads`, {
      data: { email: unique, birthMonth: 5, birthYear: 1992 },
    });

    const res = await request.get(`${BASE}/api/admin/leads?search=searchtest`, {
      headers: adminHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.leads.length).toBeGreaterThan(0);
    expect(data.leads[0].email).toContain('searchtest');
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
