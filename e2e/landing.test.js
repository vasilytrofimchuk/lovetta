const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

test.describe('Landing page', () => {
  test('ios welcome route shows the landing-style carousel', async ({ page }) => {
    const templates = [
      { name: 'Sakura', age: 24, style: 'anime', tagline: 'Adventure is out there!', avatar_url: '/assets/brand/og-image.png', video_url: '' },
      { name: 'Aiko', age: 26, style: 'anime', tagline: 'Late nights and good stories.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
      { name: 'Aria', age: 23, style: 'real', tagline: 'Sweet, playful, impossible to forget.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
      { name: 'Luna', age: 25, style: 'real', tagline: 'A little mystery makes it better.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
    ];

    await page.route('**/api/companions/templates/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates }),
      });
    });

    await page.goto(`${BASE}/my/welcome`);

    await expect(page.getByRole('heading', { name: 'Your AI Girlfriend' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.locator('[data-testid="welcome-card"][data-copy="primary"]')).toHaveCount(4);
    await expect.poll(async () => page.locator('[data-testid="welcome-card"][data-active="true"]').count()).toBe(1);

    const primaryStyles = await page.locator('[data-testid="welcome-card"][data-copy="primary"]').evaluateAll((cards) => {
      return cards.map((card) => card.getAttribute('data-style'));
    });

    expect(primaryStyles).toContain('anime');
    expect(primaryStyles).toContain('real');
    for (let i = 1; i < primaryStyles.length; i += 1) {
      expect(primaryStyles[i - 1] === 'anime' && primaryStyles[i] === 'anime').toBeFalsy();
    }

    const initialCardLeft = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="welcome-card"][data-copy="primary"]');
      return card ? card.getBoundingClientRect().left : 0;
    });

    await page.waitForTimeout(1500);

    const movedCardLeft = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="welcome-card"][data-copy="primary"]');
      return card ? card.getBoundingClientRect().left : 0;
    });

    expect(movedCardLeft).toBeLessThan(initialCardLeft - 4);

    const metrics = await page.evaluate(() => {
      const viewport = document.querySelector('[data-testid="welcome-carousel-viewport"]');
      const active = document.querySelector('[data-testid="welcome-card"][data-active="true"]');
      if (!viewport || !active) return null;

      const viewportRect = viewport.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const viewportCenter = viewportRect.left + (viewportRect.width / 2);
      const activeCenter = activeRect.left + (activeRect.width / 2);

      return {
        distance: Math.abs(activeCenter - viewportCenter),
        transform: window.getComputedStyle(active).transform,
      };
    });

    expect(metrics).toBeTruthy();
    expect(metrics.distance).toBeLessThan(100);
    expect(metrics.transform).not.toBe('none');
  });

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
