/**
 * Demo: Actions toggle in Profile — all states.
 * Creates user + companion via API, logs in via UI,
 * chats with actions ON, toggles OFF, chats again, toggles back ON.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo, createTestUser } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

test('demo: actions toggle ON → chat → OFF → chat → ON → chat', async ({ page, request }) => {
  test.setTimeout(300000);

  // Block Google GSI
  await page.route('**/accounts.google.com/**', route => route.abort());

  // Capture console errors
  page.on('pageerror', err => console.log(`[pageerror] ${err.stack}`));

  // Create user + companion via API
  const user = await createTestUser(request);
  const templatesRes = await request.get(`${BASE}/api/companions/templates`, {
    headers: user.authHeaders,
  });
  const { templates } = await templatesRes.json();
  const template = templates.find(t => t.name === 'Luna') || templates[0];

  const createRes = await request.post(`${BASE}/api/companions`, {
    headers: user.authHeaders,
    data: { templateId: template.id },
  });
  const { companion } = await createRes.json();

  // Log in via UI
  await page.goto(`${BASE}/my/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', 'Test1234!');
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Navigate to chat
  await page.goto(`${BASE}/my/chat/${companion.id}`);
  await page.waitForSelector('textarea[placeholder="Type a message..."]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // === STATE 1: Actions ON (default) ===
  const input1 = page.locator('textarea[placeholder="Type a message..."]');
  await input1.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Hey Luna, how are you doing today?', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(15000);

  const chatUrl = page.url();

  // Navigate to Profile
  await page.goto(`${BASE}/my/profile`);
  await page.waitForSelector('text=Content Preferences', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Scroll to Content Preferences
  await page.evaluate(() => {
    const sections = [...document.querySelectorAll('h3')];
    const content = sections.find(h => h.textContent.includes('Content'));
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);

  // Verify actions toggle is visible and ON
  await expect(page.locator('text=Actions in messages')).toBeVisible();
  await page.waitForTimeout(1000);

  // === STATE 2: Toggle actions OFF ===
  const actionsToggle = page.locator('p:has-text("Actions in messages")').locator('..').locator('..').locator('button');
  await actionsToggle.click();
  await page.waitForTimeout(2000);

  // Navigate back to chat
  await page.goto(chatUrl);
  await page.waitForSelector('textarea[placeholder="Type a message..."]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Send message with actions OFF
  const input2 = page.locator('textarea[placeholder="Type a message..."]');
  await input2.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Tell me what you are doing right now', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(15000);

  // === STATE 3: Toggle actions back ON ===
  await page.goto(`${BASE}/my/profile`);
  await page.waitForSelector('text=Content Preferences', { timeout: 15000 });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const sections = [...document.querySelectorAll('h3')];
    const content = sections.find(h => h.textContent.includes('Content'));
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);

  const actionsToggle2 = page.locator('p:has-text("Actions in messages")').locator('..').locator('..').locator('button');
  await actionsToggle2.click();
  await page.waitForTimeout(2000);

  // Navigate back to chat
  await page.goto(chatUrl);
  await page.waitForSelector('textarea[placeholder="Type a message..."]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const input3 = page.locator('textarea[placeholder="Type a message..."]');
  await input3.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Give me a hug!', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(15000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-actions-toggle.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
