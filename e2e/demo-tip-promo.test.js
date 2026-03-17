/**
 * Demo: Tip promotion in-chat message with buttons.
 * Signs up, creates a companion, sends a message, shows the tip promo,
 * clicks a tip button, completes Stripe checkout, and returns to chat.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';

async function signupViaUI(page) {
  const email = `demo_tip_${Date.now()}@example.com`;
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

test('demo: tip promo → Stripe checkout → return to chat', async ({ page, request }) => {
  test.setTimeout(180000);

  // Set threshold very low so first AI response triggers tip promo
  await request.put(`${BASE}/api/admin/settings`, {
    headers: { 'Authorization': 'Bearer test-admin-token', 'Content-Type': 'application/json' },
    data: { key: 'tip_request_threshold_usd', value: '0.0001' },
  });

  // Block Google GSI
  await page.route('**/accounts.google.com/**', route => route.abort());

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

  // Capture the chat URL to verify we return to it
  const chatUrl = page.url();
  await page.waitForTimeout(2000);

  // Send a message — this will trigger AI response + consumption tracking
  const input = page.locator('textarea[placeholder="Type a message..."]');
  await input.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Hey Luna! Tell me about yourself', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  // Wait for the tip promo to appear after AI response
  await page.waitForSelector('text=Maybe later', { timeout: 60000 });
  await page.waitForTimeout(2000);

  // Verify tip buttons are visible
  await expect(page.locator('button:has-text("$9.99")')).toBeVisible();
  await page.waitForTimeout(1000);

  // Click the $9.99 tip button — this redirects to Stripe Checkout
  await page.click('button:has-text("$9.99")');

  // Wait for Stripe Checkout page to load
  await page.waitForURL('**/checkout.stripe.com/**', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill in Stripe test card details
  // Email field
  const emailInput = page.locator('#email');
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill('test@example.com');
  }

  // Card number — Stripe uses iframes for card fields
  const cardFrame = page.frameLocator('iframe[title*="card number"]').first();
  await cardFrame.locator('[name="cardnumber"], [placeholder*="card number" i]').fill('4242424242424242');

  // Expiry
  const expiryFrame = page.frameLocator('iframe[title*="expir"]').first();
  await expiryFrame.locator('[name="exp-date"], [placeholder*="MM" i]').fill('1230');

  // CVC
  const cvcFrame = page.frameLocator('iframe[title*="CVC"]').first();
  await cvcFrame.locator('[name="cvc"], [placeholder*="CVC" i]').fill('123');

  // Cardholder name (if present)
  const nameInput = page.locator('#billingName');
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.fill('Test User');
  }

  await page.waitForTimeout(1000);

  // Submit payment
  await page.locator('button[type="submit"], .SubmitButton').click();
  await page.waitForTimeout(3000);

  // Wait for redirect back to the chat page
  await page.waitForURL('**/my/chat/**', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Verify we're back in the chat with Luna
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible({ timeout: 10000 });

  // The tip promo should be gone now (tipped this month)
  await expect(page.locator('text=Maybe later')).not.toBeVisible();
  await page.waitForTimeout(2000);

  // Restore threshold
  await request.put(`${BASE}/api/admin/settings`, {
    headers: { 'Authorization': 'Bearer test-admin-token', 'Content-Type': 'application/json' },
    data: { key: 'tip_request_threshold_usd', value: '10.00' },
  });

  const videoPath = await saveNamedDemoVideo(page, 'demo-tip-promo.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
