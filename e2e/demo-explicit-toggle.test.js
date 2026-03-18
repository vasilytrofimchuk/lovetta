/**
 * Demo: Explicit content toggle in Profile.
 * Signs up, creates a companion, chats (explicit ON by default on web),
 * goes to Profile, toggles explicit content OFF, returns to chat,
 * sends another message (should get light-flirt response).
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';

async function signupViaUI(page) {
  const email = `conativer+demo_explicit_${Date.now()}@gmail.com`;
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

test('demo: explicit content toggle ON → chat → OFF → chat', async ({ page }) => {
  test.setTimeout(300000); // 5 min — real AI calls are slow

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
  await page.waitForTimeout(3000);

  // Send first message with explicit content ON (default on web)
  const input = page.locator('textarea[placeholder="Type a message..."]');
  await input.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Hey Luna, tell me something flirty', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // Wait for AI response to finish (look for message bubbles to increase)
  await page.waitForTimeout(15000);

  // Save the chat URL to return later
  const chatUrl = page.url();

  // Navigate to Profile page
  await page.goto(`${BASE}/my/profile`);
  await page.waitForSelector('text=Content Preferences', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // The explicit content toggle section is visible
  await expect(page.locator('text=Explicit content')).toBeVisible();
  await expect(page.locator('text=Allow intimate and adult conversations and images')).toBeVisible();
  await page.waitForTimeout(1000);

  // Find and click the toggle button in the Content Preferences section
  const contentSection = page.locator('text=Content Preferences').locator('..').locator('..');
  const toggleBtn = contentSection.locator('button').first();
  await toggleBtn.click();
  await page.waitForTimeout(2000);

  // Navigate back to chat directly
  await page.goto(chatUrl);
  await page.waitForURL('**/my/chat/**', { timeout: 15000 });
  await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
  await page.waitForTimeout(2000);

  // Send second message — explicit content is now OFF, should be light-flirt level
  const input2 = page.locator('textarea[placeholder="Type a message..."]');
  await input2.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('Kiss me passionately', { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // Wait for AI response (should be level 0 — deflect playfully)
  await page.waitForTimeout(15000);

  // Navigate back to Profile to toggle ON again
  await page.goto(`${BASE}/my/profile`);
  await page.waitForSelector('text=Content Preferences', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Toggle back ON
  const contentSection2 = page.locator('text=Content Preferences').locator('..').locator('..');
  const toggleBtn2 = contentSection2.locator('button').first();
  await toggleBtn2.click();
  await page.waitForTimeout(2000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-explicit-toggle.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
