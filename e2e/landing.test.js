const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

test.describe('Landing page', () => {
  test('loads with correct title and OG tags', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Lovetta/);

    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    expect(ogTitle).toContain('Lovetta');

    const ogImage = await page.getAttribute('meta[property="og:image"]', 'content');
    expect(ogImage).toBeTruthy();

    const twitterCard = await page.getAttribute('meta[name="twitter:card"]', 'content');
    expect(twitterCard).toBe('summary_large_image');
  });

  test('signup form is visible', async ({ page }) => {
    await page.goto(BASE);

    await expect(page.locator('#signup-form')).toBeVisible();
    await expect(page.locator('#month-select .custom-select-trigger')).toBeVisible();
    await expect(page.locator('#year-select .custom-select-trigger')).toBeVisible();
    await expect(page.locator('#agree-terms')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  test('footer links work', async ({ page }) => {
    await page.goto(BASE);

    const privacyLink = page.locator('a[href="/privacy.html"]').first();
    await expect(privacyLink).toBeVisible();

    const termsLink = page.locator('a[href="/terms.html"]').first();
    await expect(termsLink).toBeVisible();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto(BASE + '/privacy.html');
    await expect(page).toHaveTitle(/Privacy/);
    await expect(page.locator('h1')).toContainText('Privacy Policy');
  });

  test('terms page loads', async ({ page }) => {
    await page.goto(BASE + '/terms.html');
    await expect(page).toHaveTitle(/Terms/);
    await expect(page.locator('h1')).toContainText('Terms of Service');
  });
});
