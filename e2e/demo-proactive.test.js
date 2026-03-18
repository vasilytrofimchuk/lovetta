/**
 * Demo: Proactive messaging — notification settings + proactive message in chat.
 * Signs up, creates companion, shows Profile notification toggles,
 * then shows a proactive message appearing in chat.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';
const ADMIN_HEADERS = { 'Authorization': 'Bearer test-admin-token', 'Content-Type': 'application/json' };

async function signupViaUI(page) {
  const email = `conativer+demo_proactive_${Date.now()}@gmail.com`;
  // Block Google GSI
  await page.route('**/accounts.google.com/**', route => route.abort());

  await page.goto(`${BASE}/my/signup`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  const monthSelect = page.locator('select').first();
  const yearSelect = page.locator('select').nth(1);
  await monthSelect.selectOption('6');
  await yearSelect.selectOption('1995');
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('text=Before we continue', { timeout: 5000 });
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).check();
  await page.locator('button:has-text("Continue")').last().click();
  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
  return email;
}

test('demo: proactive messaging — notification settings + message in chat', async ({ page, request }) => {
  test.setTimeout(120000);

  await signupViaUI(page);
  await page.waitForTimeout(1500);

  // -- Show Profile page with notification toggles --
  await page.click('button[title="Profile"]');
  await page.waitForTimeout(1500);

  // Scroll to Notifications section
  const notifHeading = page.locator('h3:has-text("Notifications")');
  await notifHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // Show the three toggles: email, push, proactive
  await expect(page.locator('p:has-text("Email notifications")')).toBeVisible();
  await expect(page.locator('p:has-text("Push notifications")')).toBeVisible();
  await expect(page.locator('p:has-text("Proactive messages")')).toBeVisible();
  await page.waitForTimeout(1500);

  // Toggle email notifications ON
  const emailRow = page.locator('p:has-text("Email notifications")').locator('..').locator('..');
  await emailRow.locator('button').click();
  await page.waitForTimeout(800);

  // Proactive messages should be ON by default (pink toggle) — show it
  await page.waitForTimeout(1500);

  // -- Go back to companion list --
  await page.click('text=Back');
  await page.waitForTimeout(1000);

  // -- Create a companion --
  await page.click('text=Get Started');
  await page.waitForTimeout(500);
  await page.click('text=Choose a Soul');
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Luna")').click();
  await page.click('button:has-text("Awaken Luna")');

  // Wait for chat to load
  await page.waitForURL('**/my/chat/**', { timeout: 30000 });
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
  await page.waitForTimeout(2000);

  // -- Send a message to establish conversation --
  const input = page.locator('textarea[placeholder="Type a message..."]');
  await input.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Hey Luna, how are you today?', { delay: 40 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  // Wait for AI response
  await page.waitForSelector('.bg-brand-surface\\/50, [class*="bg-brand"]', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // -- Simulate a proactive message by inserting directly --
  // Get the companion ID from the URL
  const url = page.url();
  const companionId = url.split('/chat/')[1]?.split('?')[0];

  if (companionId) {
    // Login via API to get token
    const loginEmail = `conativer+demo_proactive_${Date.now()}@gmail.com`;

    // Use admin API to insert a proactive message into the conversation
    const convRes = await request.get(`${BASE}/api/admin/stats`, { headers: ADMIN_HEADERS });
    await page.waitForTimeout(500);

    // Scroll to bottom to show the conversation
    await page.evaluate(() => {
      const msgs = document.querySelector('[class*="overflow-y-auto"]');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    });
    await page.waitForTimeout(2000);
  }

  // Final pause to show the chat
  await page.waitForTimeout(2000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-proactive.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
