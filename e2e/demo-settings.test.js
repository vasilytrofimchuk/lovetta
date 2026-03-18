/**
 * Demo test: Google Ads compliance settings.
 * Shows admin toggles, content levels at 0, media button behavior,
 * explicit content toggle, and avatar filter visibility.
 * Records video for review.
 */

const { test, expect } = require('@playwright/test');
const { BASE, saveNamedDemoVideo, adminHeaders } = require('./helpers');

const TEST_PASSWORD = 'Test1234!';

async function signupViaUI(page) {
  const email = `conativer+demo_settings_${Date.now()}@gmail.com`;

  // Block Google GSI to prevent React DOM crash
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

  // Legal popup
  await page.waitForSelector('text=Before we continue', { timeout: 5000 });
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
  await page.locator('button:has-text("Continue")').last().click();

  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
  return email;
}

test('demo: Google Ads compliance settings', async ({ page, request }) => {
  test.setTimeout(300000); // 5 min — multi-step with AI chat

  // ─── Part 1: Admin Settings ───────────────────────────────
  // Verify default settings via API
  const settingsRes = await request.get(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
  });
  const { settings } = await settingsRes.json();

  // Content levels should be 0 (strict)
  expect(parseInt(settings.text_level_web, 10)).toBe(0);
  expect(parseInt(settings.image_level_web, 10)).toBe(0);

  // Show admin dashboard settings tab
  await page.goto(`${BASE}/admin.html`);
  await page.waitForLoadState('networkidle');

  // Enter admin token
  await page.fill('input[type="password"]', 'test-admin-token');
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(1000);

  // Click Settings tab
  await page.click('button:has-text("Settings")');
  await page.waitForTimeout(1500);

  // Scroll to feature toggles
  await page.evaluate(() => {
    const toggles = [...document.querySelectorAll('h3')].find(el => el.textContent.includes('Feature Toggles'));
    if (toggles) toggles.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(2000);

  // ─── Part 2: App config API shows correct defaults ────────
  const configRes = await request.get(`${BASE}/api/app-config`);
  const config = await configRes.json();
  expect(config.mediaEnabled).toBe(true);
  expect(config.videoEnabled).toBe(false);
  expect(config.avatarAgeFilter).toBe(false);
  expect(config.avatarSkinFilter).toBe(false);

  // ─── Part 3: Signup + Companion Creation ──────────────────
  await signupViaUI(page);
  await page.waitForTimeout(1000);

  // Create companion
  await page.click('text=Get Started');
  await page.waitForTimeout(500);
  await page.click('text=Choose a Soul');
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Emma")').click();
  await page.waitForTimeout(500);
  await page.click('button:has-text("Awaken Emma")');
  await page.waitForURL('**/my/chat/**', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // ─── Part 4: Chat — verify photo button appears ───────────
  // Send a message
  await page.fill('textarea[placeholder="Type a message..."]', 'Hey Emma! Tell me about yourself');
  await page.keyboard.press('Enter');

  // Wait for AI response
  await page.waitForTimeout(15000);

  // Send several more messages to trigger the photo button threshold
  const messages = [
    'What do you like to do for fun?',
    'That sounds amazing!',
    'Tell me something interesting',
    'I love that about you',
    'What are you up to today?',
  ];

  for (const msg of messages) {
    await page.fill('textarea[placeholder="Type a message..."]', msg);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(12000);
  }

  // Photo button should eventually appear (after 5-15 messages without media)
  // It's the camera icon button
  const photoButton = page.locator('button[title="Ask for a photo"]');
  const hasPhotoButton = await photoButton.isVisible().catch(() => false);
  console.log(`[demo] Photo button visible: ${hasPhotoButton}`);
  await page.waitForTimeout(2000);

  // ─── Part 5: Profile — explicit content toggle ────────────
  await page.goto(`${BASE}/my/profile`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Scroll to Content Preferences
  await page.evaluate(() => {
    const content = [...document.querySelectorAll('h3')].find(h => h.textContent.includes('Content'));
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1500);

  // Verify explicit content toggle text
  await expect(page.locator('text=Allow mature content in conversations and images')).toBeVisible();

  // Toggle should be OFF by default for new user
  const contentSection = page.locator('text=Content Preferences').locator('..').locator('..');
  const toggleBtn = contentSection.locator('button').first();
  const toggleClass = await toggleBtn.getAttribute('class');
  const isOff = !toggleClass.includes('bg-brand-accent');
  console.log(`[demo] Explicit toggle OFF by default: ${isOff}`);
  expect(isOff).toBe(true);
  await page.waitForTimeout(2000);

  // ─── Part 6: Create custom companion — show avatar filters ─
  await page.goto(`${BASE}/my/`);
  await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.click('button[title="Create new girlfriend"]');
  await page.waitForTimeout(500);
  await page.click('text=Be the Creator');
  await page.waitForTimeout(1000);

  // Verify only Style and Hair filters are visible (age & skin hidden)
  await expect(page.locator('span:has-text("Style")')).toBeVisible();
  await expect(page.locator('span:has-text("Hair")')).toBeVisible();

  // Age and Skin filters should NOT be visible
  const skinVisible = await page.locator('span.text-xs.text-brand-muted:has-text("Skin")').isVisible().catch(() => false);
  const ageVisible = await page.locator('span.text-xs.text-brand-muted:has-text("Age")').isVisible().catch(() => false);
  console.log(`[demo] Skin filter visible: ${skinVisible}, Age filter visible: ${ageVisible}`);
  expect(skinVisible).toBe(false);
  expect(ageVisible).toBe(false);
  await page.waitForTimeout(2000);

  // ─── Part 7: Enable avatar filters via admin API ──────────
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_avatar_age_filter', value: true },
  });
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_avatar_skin_filter', value: true },
  });

  // Cache invalidated on admin settings write — no wait needed
  await page.waitForTimeout(1000);

  // Navigate to companion list and then custom creation to pick up new config
  await page.goto(`${BASE}/my/`);
  await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });
  await page.click('button[title="Create new girlfriend"]');
  await page.waitForTimeout(500);
  await page.click('text=Be the Creator');
  await page.waitForTimeout(1000);

  // Now Skin and Age filters should be visible
  await expect(page.locator('span.text-xs:has-text("Skin")')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('span.text-xs:has-text("Age")')).toBeVisible({ timeout: 5000 });
  console.log('[demo] Skin and Age filters now visible after admin enable');
  await page.waitForTimeout(2000);

  // ─── Part 8: Disable image generation via admin ───────────
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_image_generation', value: false },
  });

  await page.waitForTimeout(1000);

  // Verify app-config reflects the change
  const config2Res = await request.get(`${BASE}/api/app-config`);
  const config2 = await config2Res.json();
  expect(config2.mediaEnabled).toBe(false);
  console.log('[demo] Image generation disabled via admin');

  // Reset settings back to defaults for other tests
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_image_generation', value: true },
  });
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_avatar_age_filter', value: false },
  });
  await request.put(`${BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    data: { key: 'enable_avatar_skin_filter', value: false },
  });

  await page.waitForTimeout(1000);

  // Save video
  const videoPath = await saveNamedDemoVideo(page, 'demo-settings.webm');
  console.log(`[demo] saved video: ${videoPath}`);
});
