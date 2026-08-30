/**
 * Hard paywall — grandfather logic.
 *
 * Covers the two decisions in isHardPaywalled(): the `hard_paywall_enabled`
 * kill switch, and the `hard_paywall_cutover_at` grandfather line. Both are
 * observable through `freeTierAvailable` on GET /api/billing/status, which is
 * what the client's PaywallGate reads.
 *
 * The enforcement itself (403 on companion create, SSE `subscription_required`
 * on chat) can't be asserted here: isSubscriptionActive() short-circuits to
 * true whenever NODE_ENV is test, so every test user looks subscribed. Run the
 * server with PAYWALL_ENFORCE=1 to exercise that path manually.
 *
 * Serial: these tests mutate global app_settings.
 */

const { test, expect } = require('@playwright/test');
const { BASE, adminHeaders, createTestUser } = require('./helpers');

test.describe.configure({ mode: 'serial' });

async function setSetting(request, key, value) {
  const res = await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key, value },
  });
  expect(res.ok()).toBeTruthy();
}

async function freeTierAvailable(request, user) {
  const res = await request.get(`${BASE}/api/billing/status`, { headers: user.authHeaders });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).freeTierAvailable;
}

test.describe('Hard paywall', () => {
  test.afterAll(async ({ request }) => {
    await setSetting(request, 'hard_paywall_enabled', false);
  });

  test('migration seeds the flag off and stamps a cutover', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/settings`, { headers: adminHeaders() });
    const { settings } = await res.json();
    expect(settings.hard_paywall_enabled).toBe(false);
    expect(typeof settings.hard_paywall_cutover_at).toBe('string');
    expect(Number.isNaN(Date.parse(settings.hard_paywall_cutover_at))).toBe(false);
  });

  test('flag off — everyone keeps the free tier', async ({ request }) => {
    await setSetting(request, 'hard_paywall_enabled', false);
    const user = await createTestUser(request);
    expect(await freeTierAvailable(request, user)).toBe(true);
  });

  test('flag on — a user created after the cutover loses the free tier', async ({ request }) => {
    await setSetting(request, 'hard_paywall_cutover_at', new Date(Date.now() - 60_000).toISOString());
    await setSetting(request, 'hard_paywall_enabled', true);
    const user = await createTestUser(request);
    expect(await freeTierAvailable(request, user)).toBe(false);
  });

  test('flag on — a user created before the cutover is grandfathered', async ({ request }) => {
    await setSetting(request, 'hard_paywall_enabled', true);
    const user = await createTestUser(request);
    // Move the cutover past this user's signup: they are now "pre-cutover".
    await setSetting(request, 'hard_paywall_cutover_at', new Date(Date.now() + 60_000).toISOString());
    expect(await freeTierAvailable(request, user)).toBe(true);
  });

  test('turning the flag back off restores the free tier for post-cutover users', async ({ request }) => {
    await setSetting(request, 'hard_paywall_cutover_at', new Date(Date.now() - 60_000).toISOString());
    await setSetting(request, 'hard_paywall_enabled', true);
    const user = await createTestUser(request);
    expect(await freeTierAvailable(request, user)).toBe(false);

    await setSetting(request, 'hard_paywall_enabled', false);
    expect(await freeTierAvailable(request, user)).toBe(true);
  });
});
