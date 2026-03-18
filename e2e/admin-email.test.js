const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

const TOKEN = 'test-admin-token';

async function loginAdmin(page) {
  await page.goto(BASE + '/admin.html');
  await page.fill('#token-input', TOKEN);
  await page.click('#auth-gate button');
  await page.waitForSelector('#dashboard', { state: 'visible' });
}

async function seedEmail(page) {
  // Seed a test email via direct API call
  await page.evaluate(async (base) => {
    await fetch(base + '/api/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'email.received',
        data: {
          email_id: 'test-seed',
          from: 'conativer+tester@gmail.com',
          to: 'v@lovetta.ai',
          subject: 'Seeded test email',
          text: 'Hello from test seed!',
          html: '',
          headers: { 'message-id': '<seed-msg@lovetta.ai>' }
        }
      })
    });
  }, BASE);
}

test.describe('Admin Email Tab', () => {
  test('email tab loads and shows elements', async ({ page }) => {
    await loginAdmin(page);

    const emailTab = page.locator('.tab[onclick="switchTab(\'email\')"]');
    await expect(emailTab).toBeVisible();
    await emailTab.click();

    await expect(page.locator('#tab-email')).toBeVisible();
    await expect(page.locator('.email-filter[data-dir="inbound"]')).toBeVisible();
    await expect(page.locator('.email-filter[data-dir="outbound"]')).toBeVisible();
    await expect(page.locator('.email-filter[data-dir="all"]')).toBeVisible();

    const composeBtn = page.locator('#tab-email button', { hasText: 'Compose' });
    await expect(composeBtn).toBeVisible();
    await expect(page.locator('#email-rows')).toBeVisible();
  });

  test('compose form opens and has from addresses', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('.tab[onclick="switchTab(\'email\')"]').click();
    await expect(page.locator('#tab-email')).toBeVisible();

    await page.locator('#tab-email button', { hasText: 'Compose' }).click();
    await expect(page.locator('#email-compose')).toBeVisible();
    await expect(page.locator('#compose-title')).toHaveText('New Email');

    await expect(page.locator('.from-badge').first()).toBeVisible({ timeout: 3000 });
    const fromBadges = page.locator('.from-badge');
    await expect(fromBadges).toHaveCount(2);

    await expect(page.locator('#compose-from')).toContainText('v@lovetta.ai');
    await expect(page.locator('#compose-from')).toContainText('hello@lovetta.ai');

    // Cancel closes
    await page.locator('#email-compose button', { hasText: 'Cancel' }).click();
    await expect(page.locator('#email-compose')).toBeHidden();
  });

  test('filter buttons switch views', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('.tab[onclick="switchTab(\'email\')"]').click();
    await expect(page.locator('#tab-email')).toBeVisible();

    // Default: Inbox active
    await expect(page.locator('.email-filter[data-dir="inbound"]')).toHaveClass(/active/);

    // Switch to Sent
    await page.locator('.email-filter[data-dir="outbound"]').click();
    await expect(page.locator('.email-filter[data-dir="outbound"]')).toHaveClass(/active/);
    await expect(page.locator('.email-filter[data-dir="inbound"]')).not.toHaveClass(/active/);

    // Switch to All
    await page.locator('.email-filter[data-dir="all"]').click();
    await expect(page.locator('.email-filter[data-dir="all"]')).toHaveClass(/active/);
  });

  test('inbound email appears in inbox with unread badge', async ({ page }) => {
    await loginAdmin(page);

    // Seed an inbound email
    await seedEmail(page);

    // Navigate to email tab
    await page.locator('.tab[onclick="switchTab(\'email\')"]').click();
    await expect(page.locator('#tab-email')).toBeVisible();

    // Wait for email list to load
    await page.waitForTimeout(500);

    // Should show inbound email
    await expect(page.locator('#email-rows')).toContainText('conativer+tester@gmail.com');
    await expect(page.locator('#email-rows')).toContainText('Seeded test email');

    // Unread badge should be visible
    const badge = page.locator('#email-badge');
    await expect(badge).toBeVisible();
  });

  test('clicking email opens detail with reply', async ({ page }) => {
    await loginAdmin(page);
    await seedEmail(page);

    await page.locator('.tab[onclick="switchTab(\'email\')"]').click();
    await expect(page.locator('#tab-email')).toBeVisible();
    await page.waitForTimeout(500);

    // Click on first email row
    const firstRow = page.locator('#email-rows tr.email-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    // Detail view
    await expect(page.locator('#email-detail')).toBeVisible();
    await expect(page.locator('#detail-subject')).not.toBeEmpty();
    await expect(page.locator('#detail-from')).not.toBeEmpty();
    await expect(page.locator('#detail-to')).not.toBeEmpty();
    await expect(page.locator('#detail-date')).not.toBeEmpty();
    await expect(page.locator('#detail-body')).toContainText('Hello from test seed');

    // Reply
    await page.locator('#email-detail button', { hasText: 'Reply' }).click();
    await expect(page.locator('#email-compose')).toBeVisible();
    await expect(page.locator('#compose-title')).toHaveText('Reply');
    const toValue = await page.locator('#compose-to').inputValue();
    expect(toValue).toBe('conativer+tester@gmail.com');
    const subjectValue = await page.locator('#compose-subject').inputValue();
    expect(subjectValue).toContain('Re:');

    // Close
    await page.locator('#email-compose button', { hasText: 'Cancel' }).click();
    await page.locator('#email-detail button', { hasText: 'Close' }).click();
    await expect(page.locator('#email-detail')).toBeHidden();
  });

  test('send email and verify in sent tab', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('.tab[onclick="switchTab(\'email\')"]').click();
    await expect(page.locator('#tab-email')).toBeVisible();

    // Compose
    await page.locator('#tab-email button', { hasText: 'Compose' }).click();
    await expect(page.locator('#email-compose')).toBeVisible();

    await page.fill('#compose-to', 'conativer+uitest@gmail.com');
    await page.fill('#compose-subject', 'UI Test Email');
    await page.fill('#compose-body', 'Sent from Playwright test');

    await page.locator('#email-compose button', { hasText: 'Send' }).click();

    // No Resend API key in test — email send will be skipped but stored in DB
    // Wait for send to complete (success or the API returns ok even without key)
    await expect(page.locator('#compose-status')).toContainText('Sent', { timeout: 5000 });
    await expect(page.locator('#email-compose')).toBeHidden({ timeout: 3000 });

    // Switch to Sent filter
    await page.locator('.email-filter[data-dir="outbound"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#email-rows')).toContainText('conativer+uitest@gmail.com');
  });
});
