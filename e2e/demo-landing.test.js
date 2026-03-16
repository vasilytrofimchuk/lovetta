const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo } = require('./helpers');

test('demo: landing page and signup form', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForTimeout(1500);

  // Scroll through features
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(1000);

  // Scroll to signup form
  await page.evaluate(() => document.querySelector('.signup-card').scrollIntoView({ behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  // Fill in email
  await page.fill('#email', 'demo@lovetta.ai');
  await page.waitForTimeout(500);

  // Select birth month
  await page.selectOption('#birth-month', '6');
  await page.waitForTimeout(300);

  // Select birth year
  await page.selectOption('#birth-year', '1995');
  await page.waitForTimeout(300);

  // Check terms
  await page.check('#agree-terms');
  await page.waitForTimeout(500);

  // Pause on filled form
  await page.waitForTimeout(1000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-landing.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});

test('demo: login page', async ({ page }) => {
  // Block Google GSI script to prevent React DOM crash
  await page.route('**/accounts.google.com/**', route => route.abort());

  await page.goto(`${BASE}/my/login`);
  await page.waitForLoadState('networkidle');

  // Wait for React to render
  await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);

  // Fill in credentials
  await page.fill('input[placeholder="your@email.com"]', 'demo@lovetta.ai');
  await page.waitForTimeout(500);

  await page.fill('input[placeholder="Enter password"]', 'demopassword');
  await page.waitForTimeout(1000);

  const videoPath = await saveNamedDemoVideo(page, 'demo-login.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
