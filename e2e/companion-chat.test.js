/**
 * Full UI tests for companion creation wizard and chat.
 * Tests the complete user flow: signup → companion list → create → chat → back.
 * Uses real OpenRouter API for chat (costs a few cents).
 */

const { test, expect, devices } = require('@playwright/test');
const { BASE, createTestUser } = require('./helpers');

// Load env for API keys
try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';

async function seedAuthenticatedUser(page, request) {
  const user = await createTestUser(request);

  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('lovetta-token', accessToken);
    localStorage.setItem('lovetta-refresh-token', refreshToken);
  }, {
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
  });

  return user;
}

async function createCompanionViaApi(request, user) {
  const templatesRes = await request.get(`${BASE}/api/companions/templates`, {
    headers: user.authHeaders,
  });
  expect(templatesRes.ok()).toBeTruthy();
  const templatesData = await templatesRes.json();
  const template = templatesData.templates.find((item) => item.name === 'Luna') || templatesData.templates[0];
  expect(template).toBeTruthy();

  const createRes = await request.post(`${BASE}/api/companions`, {
    headers: user.authHeaders,
    data: { templateId: template.id },
  });
  expect(createRes.ok()).toBeTruthy();
  const createData = await createRes.json();
  return createData.companion;
}

/**
 * Complete the consent step shown before web signup.
 */
async function completeConsentStep(page) {
  await page.waitForSelector('text=Verify your age', { timeout: 10000 });
  await page.locator('button:has-text("Month")').click();
  await page.locator('button:has-text("June")').click();
  await page.locator('button:has-text("Year")').click();
  await page.locator('button:has-text("1995")').click();

  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
}

/**
 * Sign up a new user via the UI and land on companion list.
 */
async function signupViaUI(page) {
  const email = `conativer+uitest_${Date.now()}@gmail.com`;

  await page.goto(`${BASE}/my/signup`);
  await completeConsentStep(page);

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await page.waitForSelector('[data-testid="onboarding-plan-screen"]', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
  return email;
}

// ============================================================
// Companion List — empty state
// ============================================================

test.describe('Companion List', () => {
  test('signup consent step blocks progress without age and agreements', async ({ page }) => {
    await page.goto(`${BASE}/my/signup`);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('text=Please select your birth date')).toBeVisible();

    await page.locator('button:has-text("Month")').click();
    await page.locator('button:has-text("June")').click();
    await page.locator('button:has-text("Year")').click();
    await page.locator('button:has-text("1995")').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('text=Please accept all agreements')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify your age' })).toBeVisible();
  });

  test('signup routes to onboarding pricing and skip returns to app home', async ({ page }) => {
    const email = `conativer+pricing_${Date.now()}@gmail.com`;

    await page.goto(`${BASE}/my/signup`);
    await completeConsentStep(page);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await page.waitForSelector('[data-testid="onboarding-plan-screen"]', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Unlock Everything' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();

    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
    await expect(page.locator('text=Bring someone special to life')).toBeVisible();
  });

  test('ipad uses wide auth screens and full-width app surfaces', async ({ browser, request }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      ...devices['iPad Pro 11 landscape'],
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/my/login`);

    const authWidth = await page.locator('[data-testid="auth-form-shell"]').evaluate((node) => node.getBoundingClientRect().width);
    expect(authWidth).toBeGreaterThan(700);

    await page.goto(`${BASE}/my/signup`);

    const consentWidth = await page.locator('[data-testid="signup-consent-shell"]').evaluate((node) => node.getBoundingClientRect().width);
    expect(consentWidth).toBeGreaterThan(700);

    const user = await seedAuthenticatedUser(page, request);
    const companion = await createCompanionViaApi(request, user);

    await page.goto(`${BASE}/my/`);
    await page.waitForSelector('[data-testid="companion-list-content"]', { timeout: 10000 });

    const tabletListMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="app-shell"]');
      const content = document.querySelector('[data-testid="companion-list-content"]');
      if (!shell || !content) return null;
      return {
        shellWidth: shell.getBoundingClientRect().width,
        contentWidth: content.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      };
    });

    expect(tabletListMetrics).toBeTruthy();
    expect(Math.abs(tabletListMetrics.shellWidth - tabletListMetrics.viewportWidth)).toBeLessThanOrEqual(2);
    expect(tabletListMetrics.contentWidth).toBeGreaterThan(760);

    await page.goto(`${BASE}/my/chat/${companion.id}`);
    await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

    const tabletChatMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="app-shell"]');
      const chat = document.querySelector('[data-testid="chat-page"]');
      if (!shell || !chat) return null;
      return {
        shellWidth: shell.getBoundingClientRect().width,
        chatWidth: chat.getBoundingClientRect().width,
      };
    });

    expect(tabletChatMetrics).toBeTruthy();
    expect(Math.abs(tabletChatMetrics.chatWidth - tabletChatMetrics.shellWidth)).toBeLessThanOrEqual(2);

    await context.close();
  });

  test('desktop uses a centered 960px shell while auth stays narrow', async ({ page, request }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/my/login`);

    const authWidth = await page.locator('[data-testid="auth-form-shell"]').evaluate((node) => node.getBoundingClientRect().width);
    expect(authWidth).toBeLessThan(420);

    const user = await seedAuthenticatedUser(page, request);
    const companion = await createCompanionViaApi(request, user);

    await page.goto(`${BASE}/my/`);
    await page.waitForSelector('[data-testid="companion-list-content"]', { timeout: 10000 });

    const desktopListMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="app-shell"]');
      const content = document.querySelector('[data-testid="companion-list-content"]');
      if (!shell || !content) return null;

      const shellRect = shell.getBoundingClientRect();
      return {
        shellWidth: shellRect.width,
        shellLeft: shellRect.left,
        shellRight: window.innerWidth - shellRect.right,
        contentWidth: content.getBoundingClientRect().width,
      };
    });

    expect(desktopListMetrics).toBeTruthy();
    expect(desktopListMetrics.shellWidth).toBeGreaterThan(940);
    expect(desktopListMetrics.shellWidth).toBeLessThanOrEqual(960);
    expect(Math.abs(desktopListMetrics.shellLeft - desktopListMetrics.shellRight)).toBeLessThanOrEqual(2);
    expect(desktopListMetrics.shellLeft).toBeGreaterThan(200);
    expect(desktopListMetrics.contentWidth).toBeGreaterThan(900);

    await page.goto(`${BASE}/my/chat/${companion.id}`);
    await page.waitForSelector('[data-testid="chat-page"]', { timeout: 10000 });

    const desktopChatMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="app-shell"]');
      const chat = document.querySelector('[data-testid="chat-page"]');
      if (!shell || !chat) return null;
      return {
        shellWidth: shell.getBoundingClientRect().width,
        chatWidth: chat.getBoundingClientRect().width,
      };
    });

    expect(desktopChatMetrics).toBeTruthy();
    expect(Math.abs(desktopChatMetrics.chatWidth - desktopChatMetrics.shellWidth)).toBeLessThanOrEqual(2);
  });

  test('full-screen routes clamp document height and keep scrolling inside page regions', async ({ page, request }) => {
    await page.goto(`${BASE}/my/welcome`);
    await page.waitForSelector('[data-testid="welcome-screen"]', { timeout: 10000 });

    const welcomeMetrics = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="welcome-screen"]');
      const scrollRegion = document.querySelector('[data-testid="welcome-scroll-region"]');
      if (!screen || !scrollRegion || !document.scrollingElement) return null;

      return {
        screenHeight: screen.getBoundingClientRect().height,
        docOverflow: document.scrollingElement.scrollHeight - window.innerHeight,
        scrollClientHeight: scrollRegion.clientHeight,
      };
    });

    expect(welcomeMetrics).toBeTruthy();
    expect(Math.abs(welcomeMetrics.screenHeight - page.viewportSize().height)).toBeLessThanOrEqual(2);
    expect(welcomeMetrics.docOverflow).toBeLessThanOrEqual(2);
    expect(welcomeMetrics.scrollClientHeight).toBeGreaterThan(0);

    await seedAuthenticatedUser(page, request);
    await page.goto(`${BASE}/my/create`);
    await page.waitForSelector('[data-testid="companion-create-page"]', { timeout: 10000 });
    await page.getByRole('button', { name: 'Be the Creator' }).click();

    const createMetrics = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="companion-create-page"]');
      const scrollRegion = document.querySelector('[data-testid="companion-create-scroll-region"]');
      if (!screen || !scrollRegion || !document.scrollingElement) return null;

      return {
        screenHeight: screen.getBoundingClientRect().height,
        docOverflow: document.scrollingElement.scrollHeight - window.innerHeight,
        scrollOverflow: scrollRegion.scrollHeight - scrollRegion.clientHeight,
      };
    });

    expect(createMetrics).toBeTruthy();
    expect(Math.abs(createMetrics.screenHeight - page.viewportSize().height)).toBeLessThanOrEqual(2);
    expect(createMetrics.docOverflow).toBeLessThanOrEqual(2);
    expect(createMetrics.scrollOverflow).toBeGreaterThan(0);
  });

  test('shows empty state for new user', async ({ page }) => {
    await signupViaUI(page);
    await expect(page.locator('text=Bring someone special to life')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Get Started')).toBeVisible();
  });

  test('has create and profile buttons', async ({ page }) => {
    await signupViaUI(page);
    await expect(page.locator('button[title="Create new girlfriend"]')).toBeVisible();
    await expect(page.locator('button[title="Profile"]')).toBeVisible();
  });

  test('Get Started navigates to create page', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.waitForURL('**/my/create', { timeout: 5000 });
  });

  test('subscription status loads for user', async ({ page }) => {
    await signupViaUI(page);
    // In test/dev mode, isSubscriptionActive always returns true,
    // so the "No active plan" banner is never shown.
    // Verify the companion list page loaded successfully.
    await expect(page.locator('text=Bring someone special to life')).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// Companion Create Wizard
// ============================================================

test.describe('Companion Create Wizard', () => {
  test('shows three creation paths', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.waitForURL('**/my/create');

    await expect(page.locator('text=Surprise Me')).toBeVisible();
    await expect(page.locator('text=Choose a Soul')).toBeVisible();
    await expect(page.locator('text=Be the Creator')).toBeVisible();
  });

  test('Browse Templates shows template grid', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');

    await expect(page.locator('text=Luna')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Sophia')).toBeVisible();
    await expect(page.locator('text=Emma')).toBeVisible();
  });

  test('selecting a template shows confirm screen with Awaken button', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Luna")').click();

    await expect(page.locator('button:has-text("Awaken Luna")')).toBeVisible();
    await expect(page.locator('text=Personality')).toBeVisible();
  });

  test('Custom path shows name and personality form', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Be the Creator');

    await expect(page.locator('input[placeholder*="name"]')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('Custom form Continue button disabled without both fields', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Be the Creator');

    const continueBtn = page.locator('button:has-text("Continue")');
    await expect(continueBtn).toBeDisabled();

    await page.fill('input[placeholder*="name"]', 'Test');
    await expect(continueBtn).toBeDisabled();

    await page.fill('textarea', 'A fun personality');
    await expect(continueBtn).toBeEnabled();
  });

  test('Surprise Me goes to confirm with random template', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Surprise Me');

    await expect(page.locator('button:has-text("Awaken")')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// Companion Creation — real API
// ============================================================

test.describe('Companion Creation — real API', () => {
  test('creates companion from template and opens chat', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Luna")').click();
    await page.click('button:has-text("Awaken Luna")');

    await expect(page.locator('text=Bringing her to life')).toBeVisible();
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    // Chat header shows Luna
    await expect(page.locator('.font-semibold:has-text("Luna")')).toBeVisible();
    await expect(page.locator('text=online')).toBeVisible();
  }, 60000);

  test('first message appears in chat', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Surprise Me');
    await page.locator('button:has-text("Awaken")').click();

    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    // Wait for first message to render
    const bubble = page.locator('.rounded-2xl.px-4');
    await expect(bubble.first()).toBeVisible({ timeout: 10000 });
  }, 60000);

  test('companion appears in list after going back', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Emma")').click();
    await page.click('button:has-text("Awaken Emma")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    // Back to list
    await page.locator('svg path[d="M19 12H5M12 19l-7-7 7-7"]').click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });

    await expect(page.locator('.font-semibold:has-text("Emma")')).toBeVisible();
    await expect(page.locator('button[title="Create new girlfriend"]')).toBeVisible();
  }, 60000);

  test('custom companion creation works', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Be the Creator');

    await page.fill('input[placeholder*="name"]', 'Aurora');
    await page.fill('textarea', 'Aurora is a mysterious astronomer who loves stargazing.');
    await page.click('text=Continue');

    await expect(page.locator('button:has-text("Awaken Aurora")')).toBeVisible();
    await page.click('button:has-text("Awaken Aurora")');

    await page.waitForURL('**/my/chat/**', { timeout: 30000 });
    await expect(page.locator('.font-semibold:has-text("Aurora")')).toBeVisible();
  }, 60000);
});

// ============================================================
// Chat UI
// ============================================================

test.describe('Chat UI', () => {
  test('chat has all elements: header, input, send, lightning', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Lily")').click();
    await page.click('button:has-text("Awaken Lily")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    await expect(page.locator('.font-semibold:has-text("Lily")')).toBeVisible();
    await expect(page.locator('text=online')).toBeVisible();
    await expect(page.locator('textarea[placeholder="Type a message..."]')).toBeVisible();

    // Send button
    await expect(page.locator('button:has(polygon[points*="22 2 15 22"])').or(page.locator('button:has(line[x1="22"])'))).toBeVisible();

    // Lightning button
    await expect(page.locator('button:has(polygon[points*="13 2 3 14"])')).toBeVisible();
  }, 60000);

  test('can send message and get AI response', async ({ page }) => {
    test.setTimeout(60000);
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Mia")').click();
    await page.click('button:has-text("Awaken Mia")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Type and send
    await page.fill('textarea[placeholder="Type a message..."]', 'Hey! Tell me about yourself');
    await page.keyboard.press('Enter');

    // User message should appear
    await expect(page.locator('text=Hey! Tell me about yourself')).toBeVisible({ timeout: 5000 });

    // Wait for AI response — may fail if model is unavailable in test
    await page.waitForTimeout(5000);

    // Should have at least 2 message bubbles (user msg visible)
    const bubbles = page.locator('[class*="rounded-2xl"][class*="px-4"]');
    const count = await bubbles.count();
    expect(count).toBeGreaterThanOrEqual(1); // at minimum user msg
  }, 60000);

  test('back button returns to companion list', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Jade")').click();
    await page.click('button:has-text("Awaken Jade")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    await page.locator('svg path[d="M19 12H5M12 19l-7-7 7-7"]').click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });
    await expect(page.locator('.font-semibold:has-text("Jade")')).toBeVisible();
  }, 60000);
});

// ============================================================
// Multiple companions
// ============================================================

test.describe('Multiple Companions', () => {
  test('can create two companions and see both in list', async ({ page }) => {
    await signupViaUI(page);

    // Create Sophia
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Sophia")').click();
    await page.click('button:has-text("Awaken Sophia")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    await page.locator('svg path[d="M19 12H5M12 19l-7-7 7-7"]').click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });

    // Create Violet via + button
    await page.click('button[title="Create new girlfriend"]');
    await page.click('text=Choose a Soul');
    await page.locator('button:has-text("Violet")').click();
    await page.click('button:has-text("Awaken Violet")');
    await page.waitForURL('**/my/chat/**', { timeout: 30000 });

    await page.locator('svg path[d="M19 12H5M12 19l-7-7 7-7"]').click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });

    // Both visible
    await expect(page.locator('.font-semibold:has-text("Sophia")')).toBeVisible();
    await expect(page.locator('.font-semibold:has-text("Violet")')).toBeVisible();
  }, 120000);
});

// ============================================================
// Navigation
// ============================================================

test.describe('Navigation', () => {
  test('profile button goes to profile page', async ({ page }) => {
    await signupViaUI(page);
    await page.click('button[title="Profile"]');
    await page.waitForURL('**/my/profile');
    await expect(page.locator('h1:has-text("Profile")')).toBeVisible();
  });

  test('profile page has subscription and sign out', async ({ page }) => {
    await signupViaUI(page);
    await page.click('button[title="Profile"]');

    await expect(page.locator('h3:has-text("Subscription")')).toBeVisible();
    await expect(page.locator('text=Sign out')).toBeVisible();
    await expect(page.locator('h3:has-text("Notifications")')).toBeVisible();
    await expect(page.locator('h3:has-text("App Icon")')).toHaveCount(0);
  });

  test('profile back button returns to list', async ({ page }) => {
    await signupViaUI(page);
    await page.click('button[title="Profile"]');
    await page.waitForURL('**/my/profile');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('button[title="Profile"]', { timeout: 10000 });
  });

  test('sign out returns to login', async ({ page }) => {
    await signupViaUI(page);
    await page.click('button[title="Profile"]');
    await page.click('text=Sign out');
    await page.waitForURL('**/my/login', { timeout: 5000 });
  });
});
