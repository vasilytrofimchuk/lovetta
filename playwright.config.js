const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  retries: 0,
  workers: 4,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'default',
      testMatch: '**/*.test.js',
      testIgnore: [/demo-.*\.test\.js$/, /ai-real\.test\.js$/],
    },
    {
      name: 'api',
      testMatch: ['tracking.test.js', 'admin.test.js', 'auth.test.js', 'ios-billing.test.js'],
    },
    {
      name: 'ai',
      testMatch: 'ai.test.js',
    },
    {
      name: 'ui',
      testMatch: ['landing.test.js', 'admin-email.test.js', 'companion-chat.test.js', 'wizard-nav.test.js'],
    },
    {
      name: 'ai-real',
      testMatch: 'ai-real.test.js',
    },
    {
      name: 'demo',
      testMatch: /demo-.*\.test\.js$/,
      use: {
        browserName: 'chromium',
        video: 'on',
      },
    },
  ],
});
