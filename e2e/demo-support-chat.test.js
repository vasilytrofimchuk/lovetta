/**
 * Demo: Support Chat — user sends message from Profile, admin replies and resolves.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';
const ADMIN_HEADERS = { 'Authorization': 'Bearer test-admin-token', 'Content-Type': 'application/json' };

async function signupViaUI(page) {
  const email = `conativer+demo_support_${Date.now()}@gmail.com`;
  await page.route('**/accounts.google.com/**', route => route.abort());
  await page.goto(`${BASE}/my/signup`);

  // Step 1: Age gate + consent
  await page.waitForSelector('text=Verify your age', { timeout: 10000 });
  const monthBtn = page.locator('label:has-text("Birth Month")').locator('..').locator('button').first();
  await monthBtn.click();
  await page.locator('button:has-text("June")').click();
  const yearBtn = page.locator('label:has-text("Birth Year")').locator('..').locator('button').first();
  await yearBtn.click();
  await page.locator('button:has-text("1995")').click();
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).check();
  await page.locator('button:has-text("Continue")').click();

  // Step 2: Email + password
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Pricing page — skip trial
  await page.waitForSelector('text=Skip for now', { timeout: 15000 });
  await page.locator('text=Skip for now').click();
  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
  return email;
}

test('demo: support chat — user sends message, admin replies, resolves', async ({ page, request }) => {
  test.setTimeout(120000);

  await signupViaUI(page);
  await page.waitForTimeout(1000);

  // -- Navigate to Profile --
  await page.click('button[title="Profile"]');
  await page.waitForTimeout(1200);

  // -- Scroll to Support section --
  const supportHeading = page.locator('h3:has-text("Support")');
  await supportHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  await expect(page.locator('button:has-text("Contact Support")')).toBeVisible();
  await page.waitForTimeout(800);

  // -- Open support chat --
  await page.click('button:has-text("Contact Support")');
  await page.waitForTimeout(1000);

  // Panel visible with welcome text
  await expect(page.locator('text=How can we help')).toBeVisible();
  await page.waitForTimeout(800);

  // -- Type and send first message --
  const textarea = page.locator('textarea[placeholder="Type a message..."]').last();
  await textarea.click();
  await page.keyboard.type("Hi! I can't access my subscription. Can you help?", { delay: 35 });
  await page.waitForTimeout(600);

  await page.locator('button:has-text("Send")').last().click();
  await page.waitForTimeout(1000);

  // Message should appear
  await expect(page.locator("text=Hi! I can't access my subscription")).toBeVisible();
  await page.waitForTimeout(1200);

  // -- Send a second message --
  await textarea.click();
  await page.keyboard.type("I signed up yesterday and the trial shows expired.", { delay: 35 });
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Send")').last().click();
  await page.waitForTimeout(1200);

  // -- Simulate admin reply via API --
  // First get the chat id
  const chatRes = await request.get(`${BASE}/api/admin/support/chats`, { headers: ADMIN_HEADERS });
  const chatData = await chatRes.json();
  const chat = chatData.chats?.[0];

  if (chat) {
    await request.post(`${BASE}/api/admin/support/chats/${chat.id}/reply`, {
      headers: ADMIN_HEADERS,
      data: { content: "Hi! I've checked your account and extended your trial by 3 days. You should see access restored now. Let me know if anything else comes up! 💙" },
    });
  }

  // Wait for poll cycle (10s) then check for reply
  await page.waitForTimeout(11000);
  await expect(page.locator("text=extended your trial by 3 days")).toBeVisible();
  await page.waitForTimeout(2000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-support-chat.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
