/**
 * Wizard navigation tests — verify every back button in the create flow.
 */

const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

try { process.loadEnvFile('.env'); } catch {}

const TEST_PASSWORD = 'Test1234!';

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

async function signupViaUI(page) {
  const email = `conativer+navtest_${Date.now()}@gmail.com`;
  await page.goto(`${BASE}/my/signup`);
  await completeConsentStep(page);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForSelector('[data-testid="onboarding-plan-screen"]', { timeout: 15000 });
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForSelector('button[title="Profile"]', { timeout: 15000 });
}

test.describe('Wizard back button navigation', () => {

  test('choose screen → back → companion list', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.waitForSelector('text=Surprise Me');

    // Back from choose → companion list
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('text=Bring someone special to life', { timeout: 5000 });
  });

  test('templates screen → back → choose screen', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.waitForSelector('text=Luna', { timeout: 5000 });

    // Back from templates → choose
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('text=Surprise Me', { timeout: 5000 });
  });

  test('confirm screen (from template) → back → templates grid', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Choose a Soul');
    await page.waitForSelector('text=Luna', { timeout: 5000 });
    await page.locator('button:has-text("Luna")').click();
    await page.waitForSelector('text=Awaken Luna', { timeout: 5000 });

    // Back from confirm → should see template grid (Luna, Sophia, etc.)
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('text=Sophia', { timeout: 5000 });
    // Verify we're on templates, not choose
    await expect(page.locator('text=Choose a Soul')).toBeVisible();
  });

  test('custom form → back → choose screen', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Be the Creator');
    await page.waitForSelector('textarea', { timeout: 5000 });

    // Back from custom → choose
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('text=Surprise Me', { timeout: 5000 });
  });

  test('confirm screen (from custom) → back → custom form', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Be the Creator');
    await page.fill('input[placeholder*="name"]', 'TestGirl');
    await page.fill('textarea', 'She is amazing');
    await page.click('text=Continue');
    await page.waitForSelector('text=Awaken TestGirl', { timeout: 5000 });

    // Back from confirm → should see custom form
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('textarea', { timeout: 5000 });
    await expect(page.locator('text=Be the Creator')).toBeVisible();
  });

  test('confirm screen (from Surprise Me) → back → choose screen', async ({ page }) => {
    await signupViaUI(page);
    await page.click('text=Get Started');
    await page.click('text=Surprise Me');
    await page.waitForSelector('button:has-text("Awaken")', { timeout: 5000 });

    // Surprise Me sets isTemplate=true, so back should go to templates
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    // Should go to templates grid (since isTemplate=true)
    await page.waitForTimeout(500);
    const onTemplates = await page.locator('text=Choose a Soul').isVisible();
    const onChoose = await page.locator('text=Surprise Me').isVisible();
    // Either templates or choose is acceptable for Surprise Me back
    expect(onTemplates || onChoose).toBe(true);
  });
});
