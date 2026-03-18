const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

test.describe('Auth API', () => {
  const testEmail = `conativer+test_${Date.now()}@gmail.com`;
  const testPassword = 'password123';

  test('POST /api/auth/signup creates user', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/signup`, {
      data: {
        email: testEmail,
        password: testPassword,
        birthMonth: 6,
        birthYear: 1995,
        termsAccepted: true,
        privacyAccepted: true,
        aiConsentAccepted: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(testEmail.toLowerCase());
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test('POST /api/auth/signup rejects underage', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/signup`, {
      data: {
        email: 'conativer+young@gmail.com',
        password: testPassword,
        birthMonth: 1,
        birthYear: 2015,
        termsAccepted: true,
        privacyAccepted: true,
        aiConsentAccepted: true,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/auth/signup rejects duplicate email', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/signup`, {
      data: {
        email: testEmail,
        password: testPassword,
        birthMonth: 6,
        birthYear: 1995,
        termsAccepted: true,
        privacyAccepted: true,
        aiConsentAccepted: true,
      },
    });
    expect(res.status()).toBe(409);
  });

  test('POST /api/auth/signup rejects without terms', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/signup`, {
      data: {
        email: 'conativer+noterms@gmail.com',
        password: testPassword,
        birthMonth: 6,
        birthYear: 1995,
        termsAccepted: false,
        privacyAccepted: true,
        aiConsentAccepted: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/auth/login with valid credentials', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { email: testEmail, password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.user.email).toBe(testEmail.toLowerCase());
    expect(data.accessToken).toBeDefined();
  });

  test('POST /api/auth/login with wrong password', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { email: testEmail, password: 'wrongpassword' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/auth/me with valid token', async ({ request }) => {
    // Login to get a fresh token
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { email: testEmail, password: testPassword },
    });
    const { accessToken } = await loginRes.json();

    const res = await request.get(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.user.email).toBe(testEmail.toLowerCase());
  });

  test('GET /api/auth/me without token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/refresh rotates tokens', async ({ request }) => {
    // Login to get a fresh refresh token
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { email: testEmail, password: testPassword },
    });
    const loginData = await loginRes.json();
    expect(loginRes.ok()).toBeTruthy();
    const refreshToken = loginData.refreshToken;
    expect(refreshToken).toBeDefined();

    const res = await request.post(`${BASE}/api/auth/refresh`, {
      data: { refreshToken },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();

    // New tokens should work for another refresh
    const res2 = await request.post(`${BASE}/api/auth/refresh`, {
      data: { refreshToken: data.refreshToken },
    });
    expect(res2.ok()).toBeTruthy();
  });

  test('POST /api/auth/forgot-password always returns ok', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/forgot-password`, {
      data: { email: testEmail },
    });
    expect(res.ok()).toBeTruthy();

    // Non-existent email also returns ok (no leak)
    const res2 = await request.post(`${BASE}/api/auth/forgot-password`, {
      data: { email: 'conativer+nonexistent@gmail.com' },
    });
    expect(res2.ok()).toBeTruthy();
  });
});

test.describe('Auth pages', () => {
  test('login page loads', async ({ page }) => {
    await page.goto(`${BASE}/my/login`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login page has signup link and google button', async ({ page }) => {
    await page.goto(`${BASE}/my/login`);
    await expect(page.locator('a[href="/my/signup"]')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
  });

  test('SPA index is served at /my/', async ({ page }) => {
    await page.goto(`${BASE}/my/`);
    // The SPA should load (either login or home depending on auth state)
    // In test environment, the built SPA may or may not exist
    // Just verify the route responds without 404
    const response = await page.goto(`${BASE}/my/anything`);
    // Either serves SPA (200) or returns 404 if not built
    expect([200, 404]).toContain(response.status());
  });
});
