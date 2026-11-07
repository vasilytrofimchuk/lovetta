const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');
const { BASE, adminHeaders } = require('./helpers');

// Card #19: «Chat Insights» shows where people drop a conversation, the most active users and
// whether a girl's own message (a reminder) gets an answer.
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test';

test.describe('Chat Insights: drop-off, most active, reminders', () => {
  let pool;
  let userId;
  let dropped;
  let active;

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    // Past the admin's test-user filter (conativer+…); nothing is ever sent to this address.
    const email = `conativer.insights${Date.now()}@gmail.com`;
    ({ rows: [{ id: userId }] } = await pool.query(
      `INSERT INTO users (email, password_hash, birth_month, birth_year, terms_accepted, privacy_accepted)
       VALUES ($1, 'hash', 1, 1990, true, true) RETURNING id`, [email]));
    const girl = async (name) => (await pool.query(
      `INSERT INTO user_companions (user_id, name, personality) VALUES ($1, $2, 'kind') RETURNING id`, [userId, name])).rows[0].id;
    const conv = async (companion, lastAt) => (await pool.query(
      `INSERT INTO conversations (user_id, companion_id, last_message_at) VALUES ($1, $2, $3) RETURNING id`,
      [userId, companion, lastAt])).rows[0].id;
    const msg = (c, role, at, proactive = false) => pool.query(
      `INSERT INTO messages (conversation_id, role, content, created_at, is_proactive) VALUES ($1, $2, 'x', $3, $4)`,
      [c, role, at, proactive]);

    // Silent for 10 days: 3 user messages, the girl spoke last → bucket 3–5, last: girl.
    const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
    dropped = await conv(await girl('Ann'), ago(240));
    await msg(dropped, 'user', ago(250)); await msg(dropped, 'assistant', ago(249));
    await msg(dropped, 'user', ago(248)); await msg(dropped, 'user', ago(247)); await msg(dropped, 'assistant', ago(240));

    // Active today: 12 user messages; a reminder 30 h ago answered 2 h later, one 3 h ago not answered.
    active = await conv(await girl('Bea'), ago(0));
    await msg(active, 'assistant', ago(30), true);
    await msg(active, 'user', ago(28));
    for (let i = 0; i < 11; i++) await msg(active, 'user', ago(20 - i));
    await msg(active, 'assistant', ago(3), true);
  });

  test.afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  test('the API counts them', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/chat-insights?days=7`, { headers: adminHeaders() });
    expect(res.ok()).toBeTruthy();
    const d = await res.json();

    const b = d.dropOff.find((r) => r.bucket === '3–5');
    expect(b, JSON.stringify(d.dropOff)).toBeTruthy();
    expect(b.conversations).toBeGreaterThanOrEqual(1);
    expect(b.last_girl).toBeGreaterThanOrEqual(1);

    const me = d.topUsers.find((u) => u.user_id === userId);
    expect(me, JSON.stringify(d.topUsers)).toMatchObject({ messages: 12, conversations: 1, companions: 1, subscribed: false, last_conversation_id: active }) // the dropped chat is 10 days old, outside the 7 days;

    expect(d.reminders.sent).toBeGreaterThanOrEqual(2);
    expect(d.reminders.answered_24h).toBeGreaterThanOrEqual(1);
    expect(d.reminders.answered_24h).toBeLessThan(d.reminders.sent);
  });

  test('the tab shows the three blocks and a user opens their chat', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('lovetta-admin-token', 'test-admin-token'); });
    await page.goto(`${BASE}/admin.html#chat-insights`);
    await expect(page.locator('#chat-insights-dropoff table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#chat-insights-reminders table')).toBeVisible();
    const link = page.locator('#chat-insights-top .insights-open-chat').filter({ hasText: 'conativer.insights' }).first();
    await expect(link).toBeVisible();
    // Readable on the dark admin (not the browser's default blue), and wide tables scroll in their own box.
    expect(await link.evaluate((a) => getComputedStyle(a).color)).not.toBe('rgb(0, 0, 238)');
    for (const id of ['#chat-insights-dropoff', '#chat-insights-top', '#chat-insights-reminders']) {
      expect(await page.locator(id + ' > div').first().evaluate((d) => getComputedStyle(d).overflowX)).toBe('auto');
    }
    // On a phone no block sticks out past the screen: the two-column grids shrink (checker, 07.11).
    await page.setViewportSize({ width: 390, height: 844 });
    const rights = await page.locator('#tab-chat-insights .section').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
    expect(Math.max(...rights)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await link.click();
    await expect(page.locator('#tab-chats')).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });
});
