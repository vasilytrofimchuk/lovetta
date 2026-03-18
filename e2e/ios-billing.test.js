const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');
const crypto = require('crypto');
const Stripe = require('stripe');
const { BASE, createTestUser } = require('./helpers');

const RC_SECRET = process.env.REVENUECAT_SECRET_KEY || 'test-revenuecat-secret';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'test-stripe-secret';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'test-stripe-webhook-secret';
const stripe = new Stripe(STRIPE_SECRET_KEY);

function revenueCatHeaders(secret = RC_SECRET) {
  return {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
}

async function postRevenueCatEvent(request, event, secret = RC_SECRET) {
  return request.post(`${BASE}/api/webhooks/revenuecat`, {
    headers: revenueCatHeaders(secret),
    data: { event },
  });
}

async function postStripeEvent(request, event, secret = STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

  return request.post(`${BASE}/api/webhooks/stripe`, {
    headers: {
      'stripe-signature': signature,
      'Content-Type': 'application/json',
    },
    data: payload,
  });
}

test.describe('iOS Billing — RevenueCat', () => {
  let pool;

  test.beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test',
    });
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test('rejects RevenueCat webhook with invalid auth', async ({ request }) => {
    const user = await createTestUser(request);
    const res = await postRevenueCatEvent(request, {
      id: `rc_invalid_${Date.now()}`,
      type: 'INITIAL_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: 'sub_invalid',
      product_id: 'lovetta_monthly',
      expiration_at_ms: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }, 'definitely-wrong');

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid RevenueCat webhook authorization');
  });

  test('INITIAL_PURCHASE creates RevenueCat subscription and exposes payment provider in billing status', async ({ request }) => {
    const user = await createTestUser(request);
    const eventId = `rc_initial_${Date.now()}`;
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const res = await postRevenueCatEvent(request, {
      id: eventId,
      type: 'INITIAL_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: `sub_${eventId}`,
      product_id: 'lovetta_monthly',
      expiration_at_ms: String(expiration),
    });

    expect(res.ok()).toBeTruthy();

    const statusRes = await request.get(`${BASE}/api/billing/status`, {
      headers: user.authHeaders,
    });
    expect(statusRes.ok()).toBeTruthy();
    const status = await statusRes.json();
    expect(status.plan).toBe('monthly');
    expect(status.status).toBe('active');
    expect(status.paymentProvider).toBe('revenuecat');

    const { rows } = await pool.query(
      `SELECT plan, status, payment_provider, revenuecat_id
         FROM subscriptions
        WHERE user_id = $1`,
      [user.userId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe('monthly');
    expect(rows[0].status).toBe('active');
    expect(rows[0].payment_provider).toBe('revenuecat');
    expect(rows[0].revenuecat_id).toBe(`sub_${eventId}`);
  });

  test('deduplicates identical RevenueCat events', async ({ request }) => {
    const user = await createTestUser(request);
    const eventId = `rc_dupe_${Date.now()}`;
    const event = {
      id: eventId,
      type: 'INITIAL_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: `sub_${eventId}`,
      product_id: 'lovetta_monthly',
      expiration_at_ms: String(Date.now() + 3 * 24 * 60 * 60 * 1000),
    };

    const first = await postRevenueCatEvent(request, event);
    const second = await postRevenueCatEvent(request, event);

    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();

    const { rows: eventRows } = await pool.query(
      `SELECT event_id FROM billing_events WHERE event_id = $1`,
      [`rc:${eventId}`]
    );
    expect(eventRows).toHaveLength(1);

    const { rows: subRows } = await pool.query(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND payment_provider = 'revenuecat'`,
      [user.userId]
    );
    expect(subRows).toHaveLength(1);
  });

  test('RevenueCat lifecycle updates the same subscription row', async ({ request }) => {
    const user = await createTestUser(request);
    const subscriberId = `sub_lifecycle_${Date.now()}`;

    const initial = {
      id: `rc_lifecycle_initial_${Date.now()}`,
      type: 'INITIAL_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: subscriberId,
      product_id: 'lovetta_monthly',
      expiration_at_ms: String(Date.now() + 14 * 24 * 60 * 60 * 1000),
    };
    await postRevenueCatEvent(request, initial);

    const productChange = {
      id: `rc_lifecycle_change_${Date.now()}`,
      type: 'PRODUCT_CHANGE',
      app_user_id: user.userId,
      subscriber_id: subscriberId,
      product_id: 'lovetta_yearly',
      expiration_at_ms: String(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
    await postRevenueCatEvent(request, productChange);

    const cancellation = {
      id: `rc_lifecycle_cancel_${Date.now()}`,
      type: 'CANCELLATION',
      app_user_id: user.userId,
      subscriber_id: subscriberId,
      product_id: 'lovetta_yearly',
      expiration_at_ms: String(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
    await postRevenueCatEvent(request, cancellation);

    const uncancel = {
      id: `rc_lifecycle_uncancel_${Date.now()}`,
      type: 'UNCANCELLATION',
      app_user_id: user.userId,
      subscriber_id: subscriberId,
      product_id: 'lovetta_yearly',
      expiration_at_ms: String(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
    await postRevenueCatEvent(request, uncancel);

    const expiration = {
      id: `rc_lifecycle_expire_${Date.now()}`,
      type: 'EXPIRATION',
      app_user_id: user.userId,
      subscriber_id: subscriberId,
      product_id: 'lovetta_yearly',
      expiration_at_ms: String(Date.now() - 1_000),
    };
    await postRevenueCatEvent(request, expiration);

    const { rows } = await pool.query(
      `SELECT plan, status, payment_provider
         FROM subscriptions
        WHERE user_id = $1 AND payment_provider = 'revenuecat'`,
      [user.userId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe('yearly');
    expect(rows[0].status).toBe('canceled');
    expect(rows[0].payment_provider).toBe('revenuecat');
  });

  test('native iOS tip intent is completed by RevenueCat tip webhook with companion-aware thank-you', async ({ request }) => {
    const user = await createTestUser(request);
    const companionId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO user_companions (id, user_id, name, personality, communication_style, age)
       VALUES ($1, $2, 'Luna', 'Playful and affectionate', 'playful', 24)`,
      [companionId, user.userId]
    );

    const intentRes = await request.post(`${BASE}/api/billing/ios/tip-intents`, {
      headers: user.authHeaders,
      data: {
        productId: 'lovetta_tip_1999',
        amount: 1999,
        companionId,
      },
    });
    expect(intentRes.ok()).toBeTruthy();
    const intent = await intentRes.json();
    expect(intent.status).toBe('pending');

    const webhookEventId = `rc_tip_${Date.now()}`;
    const webhookRes = await postRevenueCatEvent(request, {
      id: webhookEventId,
      type: 'NON_RENEWING_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: `sub_tip_${webhookEventId}`,
      product_id: 'lovetta_tip_1999',
      price_in_purchased_currency: 19.99,
    });
    expect(webhookRes.ok()).toBeTruthy();

    const intentStatusRes = await request.get(`${BASE}/api/billing/ios/tip-intents/${intent.intentId}`, {
      headers: user.authHeaders,
    });
    expect(intentStatusRes.ok()).toBeTruthy();
    const intentStatus = await intentStatusRes.json();
    expect(intentStatus.status).toBe('completed');
    expect(intentStatus.companionId).toBe(companionId);
    expect(intentStatus.tipId).toBeTruthy();
    expect(intentStatus.thankYouReady).toBe(true);

    const { rows: tipRows } = await pool.query(
      `SELECT id, amount, companion_id, stripe_payment_id
         FROM tips
        WHERE user_id = $1`,
      [user.userId]
    );
    expect(tipRows).toHaveLength(1);
    expect(tipRows[0].amount).toBe(1999);
    expect(tipRows[0].companion_id).toBe(companionId);
    expect(tipRows[0].stripe_payment_id).toBe(`rc_${webhookEventId}`);

    const { rows: conversationRows } = await pool.query(
      `SELECT id FROM conversations WHERE user_id = $1 AND companion_id = $2`,
      [user.userId, companionId]
    );
    expect(conversationRows).toHaveLength(1);

    const { rows: messageRows } = await pool.query(
      `SELECT role, content, context_text
         FROM messages
        WHERE conversation_id = $1`,
      [conversationRows[0].id]
    );
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0].role).toBe('assistant');
    expect(messageRows[0].content).toContain('made my whole day');

    const duplicateWebhookRes = await postRevenueCatEvent(request, {
      id: webhookEventId,
      type: 'NON_RENEWING_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: `sub_tip_${webhookEventId}`,
      product_id: 'lovetta_tip_1999',
      price_in_purchased_currency: 19.99,
    });
    expect(duplicateWebhookRes.ok()).toBeTruthy();

    const { rows: duplicateTipRows } = await pool.query(
      `SELECT id FROM tips WHERE user_id = $1`,
      [user.userId]
    );
    expect(duplicateTipRows).toHaveLength(1);
  });

  test('native iOS non-companion tip intent reports thank-you ready once completed', async ({ request }) => {
    const user = await createTestUser(request);

    const intentRes = await request.post(`${BASE}/api/billing/ios/tip-intents`, {
      headers: user.authHeaders,
      data: {
        productId: 'lovetta_tip_999',
        amount: 999,
      },
    });
    expect(intentRes.ok()).toBeTruthy();
    const intent = await intentRes.json();
    expect(intent.status).toBe('pending');

    const webhookEventId = `rc_tip_nocomp_${Date.now()}`;
    const webhookRes = await postRevenueCatEvent(request, {
      id: webhookEventId,
      type: 'NON_RENEWING_PURCHASE',
      app_user_id: user.userId,
      subscriber_id: `sub_tip_${webhookEventId}`,
      product_id: 'lovetta_tip_999',
      price_in_purchased_currency: 9.99,
    });
    expect(webhookRes.ok()).toBeTruthy();

    const intentStatusRes = await request.get(`${BASE}/api/billing/ios/tip-intents/${intent.intentId}`, {
      headers: user.authHeaders,
    });
    expect(intentStatusRes.ok()).toBeTruthy();
    const intentStatus = await intentStatusRes.json();
    expect(intentStatus.status).toBe('completed');
    expect(intentStatus.companionId).toBeNull();
    expect(intentStatus.tipId).toBeTruthy();
    expect(intentStatus.thankYouReady).toBe(true);

    const { rows: tipRows } = await pool.query(
      `SELECT amount, companion_id, stripe_payment_id
         FROM tips
        WHERE user_id = $1`,
      [user.userId]
    );
    expect(tipRows).toHaveLength(1);
    expect(tipRows[0].amount).toBe(999);
    expect(tipRows[0].companion_id).toBeNull();
    expect(tipRows[0].stripe_payment_id).toBe(`rc_${webhookEventId}`);
  });

  test('web Stripe companion tip webhook inserts thank-you message', async ({ request }) => {
    const user = await createTestUser(request);
    const companionId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO user_companions (id, user_id, name, personality, communication_style, age)
       VALUES ($1, $2, 'Luna', 'Playful and affectionate', 'playful', 24)`,
      [companionId, user.userId]
    );

    const eventId = `evt_tip_${Date.now()}`;
    const paymentIntentId = `pi_tip_${Date.now()}`;
    const webhookRes = await postStripeEvent(request, {
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_tip_${Date.now()}`,
          object: 'checkout.session',
          mode: 'payment',
          payment_intent: paymentIntentId,
          metadata: {
            userId: user.userId,
            type: 'tip',
            amount: '999',
            companionId,
          },
        },
      },
    });
    expect(webhookRes.ok()).toBeTruthy();

    const { rows: tipRows } = await pool.query(
      `SELECT amount, companion_id, stripe_payment_id
         FROM tips
        WHERE user_id = $1`,
      [user.userId]
    );
    expect(tipRows).toHaveLength(1);
    expect(tipRows[0].amount).toBe(999);
    expect(tipRows[0].companion_id).toBe(companionId);
    expect(tipRows[0].stripe_payment_id).toBe(paymentIntentId);

    const { rows: conversationRows } = await pool.query(
      `SELECT id FROM conversations WHERE user_id = $1 AND companion_id = $2`,
      [user.userId, companionId]
    );
    expect(conversationRows).toHaveLength(1);

    const { rows: messageRows } = await pool.query(
      `SELECT role, content, context_text
         FROM messages
        WHERE conversation_id = $1`,
      [conversationRows[0].id]
    );
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0].role).toBe('assistant');
    expect(messageRows[0].content).toContain('made my whole day');
  });
});
