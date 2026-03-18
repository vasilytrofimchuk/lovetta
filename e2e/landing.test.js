const { test, expect, devices } = require('@playwright/test');
const { BASE } = require('./helpers');

const WELCOME_TEMPLATES = [
  { name: 'Sakura', age: 24, style: 'anime', tagline: 'Adventure is out there!', avatar_url: '/assets/brand/og-image.png', video_url: '' },
  { name: 'Aiko', age: 26, style: 'anime', tagline: 'Late nights and good stories.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
  { name: 'Aria', age: 23, style: 'real', tagline: 'Sweet, playful, impossible to forget.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
  { name: 'Luna', age: 25, style: 'real', tagline: 'A little mystery makes it better.', avatar_url: '/assets/brand/og-image.png', video_url: '' },
];

test.describe('Landing page', () => {
  test('uses full width on tablet and centered shell on desktop', async ({ page }) => {
    const container = page.locator('[data-testid="landing-container"]');

    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto(BASE);

    const tabletMetrics = await container.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        right: window.innerWidth - rect.right,
      };
    });

    expect(tabletMetrics.width).toBeGreaterThan(800);
    expect(tabletMetrics.left).toBeLessThanOrEqual(1);
    expect(tabletMetrics.right).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);

    const desktopMetrics = await container.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        right: window.innerWidth - rect.right,
      };
    });

    expect(desktopMetrics.width).toBeGreaterThan(940);
    expect(desktopMetrics.width).toBeLessThanOrEqual(960);
    expect(Math.abs(desktopMetrics.left - desktopMetrics.right)).toBeLessThanOrEqual(2);
    expect(desktopMetrics.left).toBeGreaterThan(200);
  });

  test('ipad landscape stays full-width for both landing and ios welcome shell', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPad Pro 11 landscape'],
    });
    const page = await context.newPage();

    await page.route('**/api/companions/templates/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: WELCOME_TEMPLATES }),
      });
    });

    await page.goto(BASE);

    const landingMetrics = await page.locator('[data-testid="landing-container"]').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        wideTabletShell: document.documentElement.classList.contains('wide-tablet-shell'),
        width: rect.width,
        left: rect.left,
        right: window.innerWidth - rect.right,
        viewportWidth: window.innerWidth,
      };
    });

    expect(landingMetrics.wideTabletShell).toBe(true);
    expect(Math.abs(landingMetrics.width - landingMetrics.viewportWidth)).toBeLessThanOrEqual(2);
    expect(landingMetrics.left).toBeLessThanOrEqual(1);
    expect(landingMetrics.right).toBeLessThanOrEqual(1);

    await page.goto(`${BASE}/my/welcome`);

    const shellMetrics = await page.locator('[data-testid="app-shell"]').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const cta = Array.from(document.querySelectorAll('button, a'))
        .find((element) => element.textContent?.trim() === 'Continue');
      return {
        wideTabletShell: document.documentElement.classList.contains('wide-tablet-shell'),
        width: rect.width,
        left: rect.left,
        right: window.innerWidth - rect.right,
        viewportWidth: window.innerWidth,
        borderLeftWidth: window.getComputedStyle(node).borderLeftWidth,
        ctaWidth: cta ? cta.getBoundingClientRect().width : 0,
      };
    });

    expect(shellMetrics.wideTabletShell).toBe(true);
    expect(Math.abs(shellMetrics.width - shellMetrics.viewportWidth)).toBeLessThanOrEqual(2);
    expect(shellMetrics.left).toBeLessThanOrEqual(1);
    expect(shellMetrics.right).toBeLessThanOrEqual(1);
    expect(parseFloat(shellMetrics.borderLeftWidth)).toBe(0);
    expect(shellMetrics.ctaWidth).toBeGreaterThan(shellMetrics.viewportWidth * 0.6);

    await context.close();
  });

  test('ios welcome route shows the landing-style carousel', async ({ page }) => {
    await page.route('**/api/companions/templates/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: WELCOME_TEMPLATES }),
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

  test('landing shows rotator, Continue CTA, and informational pricing cards', async ({ page }) => {
    await page.goto(BASE);

    await expect(page.locator('[data-testid="landing-rotator"]')).toBeVisible();
    await expect(page.locator('[data-testid="landing-continue"]')).toBeVisible();
    await expect(page.locator('[data-testid="landing-trial-badge"]')).toContainText('FREE TRIAL');
    const pricingCards = page.locator('[data-testid="landing-pricing-card"]');
    await expect(pricingCards).toHaveCount(3);
    await expect(pricingCards.nth(0)).toContainText('Free');
    await expect(pricingCards.nth(1)).toContainText('Premium Monthly');
    await expect(pricingCards.nth(2)).toContainText('Premium Yearly');
    await expect(page.locator('#signup-form')).toHaveCount(0);
    await expect(page.locator('#agree-terms')).toHaveCount(0);
  });

  test('Continue opens signup consent step', async ({ page }) => {
    await page.goto(BASE);

    await page.locator('[data-testid="landing-continue"]').click();
    await page.waitForURL('**/my/signup?from=landing**');
    await expect(page.getByRole('heading', { name: 'Verify your age' })).toBeVisible();
    await expect(page.locator('button:has-text("Month")')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
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
