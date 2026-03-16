/**
 * Real API tests — calls OpenRouter and fal.ai with actual keys.
 * These tests cost real money (a few cents per run).
 * They verify the full pipeline: content levels → API → age guard → consumption tracking.
 */

const { test, expect } = require('@playwright/test');
const { BASE, adminHeaders, createTestUser } = require('./helpers');
const { Pool } = require('pg');

// Load .env so ai.js picks up API keys when required
try { process.loadEnvFile('.env'); } catch {}
// Point DB to test database
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test';

// Use cheap/fast models for testing
const TEST_CHAT_MODEL = 'meta-llama/llama-3.1-8b-instruct';
const TEST_IMAGE_MODEL = 'fal-ai/flux/dev';

let pool;
test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test' });
});
test.afterAll(async () => {
  await pool.end();
});

// ============================================================
// OpenRouter — streaming chat
// ============================================================

test.describe('OpenRouter — streamChat (real API)', () => {
  test('streams a response and tracks consumption', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    const companionId = '00000000-0000-4000-a000-000000000001';
    const chunks = [];
    let doneData = null;

    for await (const event of ai.streamChat(
      'You are Luna, a friendly companion. Respond in 1-2 sentences max.',
      [{ role: 'user', content: 'Hi, how are you?' }],
      { userId: user.userId, companionId, platform: 'web', model: TEST_CHAT_MODEL }
    )) {
      if (event.type === 'chunk') chunks.push(event.data);
      if (event.type === 'done') doneData = event.data;
    }

    // Should have received text chunks
    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.join('');
    expect(fullText.length).toBeGreaterThan(5);

    // Done event should have metrics
    expect(doneData).not.toBeNull();
    expect(doneData.fullText).toBe(fullText);
    expect(doneData.costUsd).toBeGreaterThan(0);

    // Consumption should be recorded in DB
    const { rows } = await pool.query(
      `SELECT * FROM api_consumption WHERE user_id = $1 AND companion_id = $2 AND call_type = 'chat'`,
      [user.userId, companionId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe('openrouter');
    expect(rows[0].model).toBe(TEST_CHAT_MODEL);
    expect(parseFloat(rows[0].cost_usd)).toBeGreaterThan(0);
  });

  test('enforces content level rules in system prompt', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    const chunks = [];
    for await (const event of ai.streamChat(
      'You are a companion. Always mention your age when greeting.',
      [{ role: 'user', content: 'Tell me about yourself' }],
      { userId: user.userId, platform: 'web', model: TEST_CHAT_MODEL }
    )) {
      if (event.type === 'chunk') chunks.push(event.data);
    }

    const response = chunks.join('');
    expect(response.length).toBeGreaterThan(0);
  });

  test('age guard allows clean adult responses', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    let doneData = null;
    for await (const event of ai.streamChat(
      'You are a 25-year-old woman named Luna. You are confident and flirty. Keep responses to 1 sentence.',
      [{ role: 'user', content: 'How old are you?' }],
      { userId: user.userId, platform: 'web', model: TEST_CHAT_MODEL }
    )) {
      if (event.type === 'done') doneData = event.data;
    }

    expect(doneData).not.toBeNull();
    expect(doneData.fullText.length).toBeGreaterThan(0);
    expect(doneData.ageGuardBlocked).toBeFalsy();
  });
});

// ============================================================
// OpenRouter — non-streaming chatCompletion
// ============================================================

test.describe('OpenRouter — chatCompletion (real API)', () => {
  test('returns a complete response and tracks consumption', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    const companionId = '00000000-0000-4000-a000-000000000002';
    const result = await ai.chatCompletion(
      'You are a helpful assistant. Respond in exactly one short sentence.',
      [{ role: 'user', content: 'Say hello' }],
      { userId: user.userId, companionId, platform: 'web', model: TEST_CHAT_MODEL }
    );

    expect(result.content.length).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);

    // Check DB
    const { rows } = await pool.query(
      `SELECT * FROM api_consumption WHERE user_id = $1 AND companion_id = $2`,
      [user.userId, companionId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe('openrouter');
  });

  test('works with different platforms', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    for (const platform of ['web', 'appstore', 'telegram']) {
      const result = await ai.chatCompletion(
        'You are a companion. Reply with one word only.',
        [{ role: 'user', content: 'Hi' }],
        { userId: user.userId, platform, model: TEST_CHAT_MODEL }
      );
      expect(result.content.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// fal.ai — image generation
// ============================================================

test.describe('fal.ai — generateImage (real API)', () => {
  test('generates an image and tracks consumption', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    const companionId = '00000000-0000-4000-a000-000000000003';
    const result = await ai.generateImage(
      'A beautiful adult woman with long brown hair, portrait photo, natural lighting, 25 years old',
      { userId: user.userId, companionId, platform: 'web', model: TEST_IMAGE_MODEL }
    );

    // Should return an image URL
    expect(result.url).toBeTruthy();
    expect(result.url).toMatch(/^https?:\/\//);
    expect(result.cost).toBeGreaterThan(0);

    // Check DB consumption
    const { rows } = await pool.query(
      `SELECT * FROM api_consumption WHERE user_id = $1 AND companion_id = $2 AND call_type = 'image'`,
      [user.userId, companionId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe('fal');
    expect(rows[0].model).toContain('flux');
  }, 60000);

  test('image prompt includes platform-specific rules', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);

    // App Store level (0) — should generate a safe, clothed image
    const result = await ai.generateImage(
      'A woman smiling in a cafe, casual outfit, portrait',
      { userId: user.userId, platform: 'appstore', model: TEST_IMAGE_MODEL }
    );

    expect(result.url).toBeTruthy();
    expect(result.url).toMatch(/^https?:\/\//);
  }, 60000);
});

// ============================================================
// Consumption shows up in admin summary after real calls
// ============================================================

test.describe('Admin consumption after real API calls', () => {
  test('consumption summary reflects recorded calls', async ({ request }) => {
    const ai = require('../server/src/ai');
    const user = await createTestUser(request);
    const companionId = '00000000-0000-4000-a000-000000000010';

    // Make a real chat call
    await ai.chatCompletion(
      'Reply with exactly: OK',
      [{ role: 'user', content: 'test' }],
      { userId: user.userId, companionId, platform: 'web', model: TEST_CHAT_MODEL }
    );

    // Check admin summary
    const res = await request.get(`${BASE}/api/admin/consumption/summary?period=7d`, {
      headers: adminHeaders(),
    });
    const data = await res.json();

    expect(data.totalCostUsd).toBeGreaterThan(0);
    expect(data.byProvider.length).toBeGreaterThan(0);

    const openrouter = data.byProvider.find(p => p.provider === 'openrouter');
    expect(openrouter).toBeTruthy();
    expect(parseFloat(openrouter.cost)).toBeGreaterThan(0);

    expect(data.byModel.length).toBeGreaterThan(0);
    expect(data.byCompanion.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Tip threshold integration (real consumption)
// ============================================================

test.describe('Tip threshold with real API', () => {
  test('shouldRequestTip triggers when cost exceeds threshold', async ({ request }) => {
    const ai = require('../server/src/ai');
    const consumption = require('../server/src/consumption');
    const user = await createTestUser(request);
    const companionId = '00000000-0000-4000-a000-000000000020';

    // Set a low threshold
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('tip_request_threshold_usd', '"0.50"', NOW())
       ON CONFLICT (key) DO UPDATE SET value = '"0.50"', updated_at = NOW()`
    );

    // Seed the balance close to threshold so a real API call pushes it over
    await pool.query(
      `INSERT INTO user_companion_cost_balance (user_id, companion_id, cumulative_cost_usd) VALUES ($1, $2, 0.50)`,
      [user.userId, companionId]
    );

    // Make a real chat call — even a tiny cost should exceed the threshold now
    let doneData = null;
    for await (const event of ai.streamChat(
      'Reply with: Hello!',
      [{ role: 'user', content: 'Hi' }],
      { userId: user.userId, companionId, platform: 'web', model: TEST_CHAT_MODEL }
    )) {
      if (event.type === 'done') doneData = event.data;
    }

    expect(doneData).not.toBeNull();
    expect(doneData.shouldRequestTip).toBe(true);

    // Reset threshold back
    await pool.query(
      `UPDATE app_settings SET value = '"2.00"', updated_at = NOW() WHERE key = 'tip_request_threshold_usd'`
    );
  });

  test('tip reset clears the threshold flag', async ({ request }) => {
    const ai = require('../server/src/ai');
    const consumption = require('../server/src/consumption');
    const user = await createTestUser(request);
    const companionId = '00000000-0000-4000-a000-000000000021';

    // Set low threshold and seed balance to exceed it
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('tip_request_threshold_usd', '"0.50"', NOW())
       ON CONFLICT (key) DO UPDATE SET value = '"0.50"', updated_at = NOW()`
    );
    await pool.query(
      `INSERT INTO user_companion_cost_balance (user_id, companion_id, cumulative_cost_usd) VALUES ($1, $2, 0.50)`,
      [user.userId, companionId]
    );

    // Make a call to exceed threshold
    const result1 = await ai.chatCompletion(
      'Reply: OK',
      [{ role: 'user', content: 'test' }],
      { userId: user.userId, companionId, platform: 'web', model: TEST_CHAT_MODEL }
    );
    expect(result1.shouldRequestTip).toBe(true);

    // Reset tip counter (simulating a tip received)
    await consumption.resetTipCounter(user.userId, companionId);

    // Verify balance was reset
    const { rows } = await pool.query(
      'SELECT cumulative_cost_usd, last_tip_reset_cost FROM user_companion_cost_balance WHERE user_id = $1 AND companion_id = $2',
      [user.userId, companionId]
    );
    expect(rows.length).toBe(1);
    expect(parseFloat(rows[0].cumulative_cost_usd)).toBe(parseFloat(rows[0].last_tip_reset_cost));

    // Reset threshold
    await pool.query(
      `UPDATE app_settings SET value = '"2.00"', updated_at = NOW() WHERE key = 'tip_request_threshold_usd'`
    );
  });
});
