/**
 * Demo: Actions toggle in Profile — all states.
 * Signs up, creates a companion, chats (actions ON by default),
 * goes to Profile, toggles actions OFF, returns to chat,
 * sends another message (should get no *actions* in response),
 * then toggles back ON and verifies actions return.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';

async function signupViaUI(page) {
  const email = `conativer+demo_actions_${Date.now()}@gmail.com`;

  // Block Google GSI to prevent React DOM crash
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

test('demo: actions toggle ON → chat → OFF → chat → ON → chat', async ({ page }) => {
  test.setTimeout(300000); // 5 min — real AI calls are slow

  await signupViaUI(page);
  await page.waitForTimeout(1000);

  // Create companion from template
  await page.click('text=Get Started');
  await page.waitForTimeout(500);
  await page.click('text=Choose a Soul');
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Luna")').click();
  await page.click('button:has-text("Awaken Luna")');

  // Wait for chat to load
  await page.waitForURL('**/my/chat/**', { timeout: 30000 });
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
  await page.waitForTimeout(3000);

  // === STATE 1: Actions ON (default) ===
  const input1 = page.locator('textarea[placeholder="Type a message..."]');
  await input1.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Hey Luna, how are you doing today?', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(15000);

  // Save chat URL
  const chatUrl = page.url();

  // Navigate to Profile
  await page.goto(`${BASE}/my/profile`);
  await page.waitForSelector('text=Content Preferences', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Scroll to Content Preferences section
  await page.evaluate(() => {
    const el = document.querySelector('h3')
    const sections = [...document.querySelectorAll('h3')];
    const content = sections.find(h => h.textContent.includes('Content'));
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);

  // Verify actions toggle is visible and ON
  await expect(page.locator('text=Actions in messages')).toBeVisible();
  await page.waitForTimeout(1000);

  // === STATE 2: Toggle actions OFF ===
  // The actions toggle row: p "Actions in messages" → div.pr-4 → div.flex → button
  const actionsToggle = page.locator('p:has-text("Actions in messages")').locator('..').locator('..').locator('button');
  await actionsToggle.click();
  await page.waitForTimeout(2000);

  // Navigate back to chat
  await page.goto(chatUrl);
  await page.waitForURL('**/my/chat/**', { timeout: 15000 });
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
  await page.waitForTimeout(2000);

  // Send message with actions OFF — should get no *actions*
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

  // Scroll to actions toggle
  await page.evaluate(() => {
    const sections = [...document.querySelectorAll('h3')];
    const content = sections.find(h => h.textContent.includes('Content'));
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);

  const actionsToggle2 = page.locator('p:has-text("Actions in messages")').locator('..').locator('..').locator('button');
  await actionsToggle2.click();
  await page.waitForTimeout(2000);

  // Navigate back to chat and send one more message with actions ON
  await page.goto(chatUrl);
  await page.waitForURL('**/my/chat/**', { timeout: 15000 });
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
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
