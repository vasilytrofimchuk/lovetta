/**
 * Billing API — subscription management, tips, billing portal.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const {
  createIosTipIntent,
  getIosTipIntent,
  isIosTipThankYouReady,
  getPaymentProvider,
  getUserSubscription,
  isSubscriptionActive,
  syncRevenueCatSubscription,
  TIP_AMOUNTS,
} = require('./billing');
const { isHardPaywalled } = require('./consumption');

const router = Router();

// -- GET /api/billing/status ------------------------------
router.get('/status', authenticate, async (req, res) => {
  try {
    const sub = await getUserSubscription(req.userId);
    const active = isSubscriptionActive(sub);
    // Whether this user has any free access at all — independent of whether
    // they are subscribed, so it stays meaningful (and testable) on its own.
    // False + !hasSubscription is what makes the client show a non-dismissable
    // paywall. True for grandfathered users (created before the cutover) and
    // whenever the hard paywall is switched off in admin.
    const freeTierAvailable = !(await isHardPaywalled(req.userId));

    res.json({
      hasSubscription: active,
      freeTierAvailable,
      plan: sub?.plan || null,
      status: sub?.status || null,
      paymentProvider: getPaymentProvider(sub),
      currentPeriodEnd: sub?.current_period_end || null,
      trialEndsAt: sub?.trial_ends_at || null,
      stripeCustomerId: sub?.stripe_customer_id || null,
    });
  } catch (err) {
    console.error('[billing] status error:', err.message);
    res.status(500).json({ error: 'Failed to load billing status' });
  }
});

// -- POST /api/billing/ios/sync ---------------------------
// Ask RevenueCat directly whether this user owns an active subscription and
// record it, instead of waiting for the webhook. The client calls this right
// after a purchase or restore so unlocking never depends on webhook delivery —
// the race that App Review lost in the sandbox (2.1(b), 1.1 build 8).
router.post('/ios/sync', authenticate, async (req, res) => {
  try {
    await syncRevenueCatSubscription(req.userId);
    const sub = await getUserSubscription(req.userId);
    const active = isSubscriptionActive(sub);
    res.json({
      hasSubscription: active,
      freeTierAvailable: !(await isHardPaywalled(req.userId)),
      plan: sub?.plan || null,
      status: sub?.status || null,
      paymentProvider: getPaymentProvider(sub),
      currentPeriodEnd: sub?.current_period_end || null,
    });
  } catch (err) {
    console.error('[billing] ios sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync subscription' });
  }
});

// -- POST /api/billing/ios/tip-intents --------------------
router.post('/ios/tip-intents', authenticate, async (req, res) => {
  try {
    const { productId, amount, companionId } = req.body || {};
    const amountCents = parseInt(amount, 10);

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing RevenueCat productId' });
    }
    if (!TIP_AMOUNTS.includes(amountCents)) {
      return res.status(400).json({ error: `Invalid amount. Use: ${TIP_AMOUNTS.join(', ')} (in cents)` });
    }

    const pool = getPool();
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    if (companionId) {
      const { rows } = await pool.query(
        'SELECT id FROM user_companions WHERE id = $1 AND user_id = $2',
        [companionId, req.userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Companion not found' });
      }
    }

    const intent = await createIosTipIntent(req.userId, {
      productId: productId.trim(),
      amount: amountCents,
      companionId: companionId || null,
    });

    res.json({
      intentId: intent.id,
      status: intent.status,
      expiresAt: intent.expires_at,
    });
  } catch (err) {
    console.error('[billing] ios tip intent create error:', err.message);
    res.status(500).json({ error: 'Failed to create iOS tip intent' });
  }
});

// -- GET /api/billing/ios/tip-intents/:id -----------------
router.get('/ios/tip-intents/:id', authenticate, async (req, res) => {
  try {
    const intent = await getIosTipIntent(req.userId, req.params.id);
    if (!intent) {
      return res.status(404).json({ error: 'Tip intent not found' });
    }

    const thankYouReady = await isIosTipThankYouReady(req.userId, intent);

    res.json({
      intentId: intent.id,
      status: intent.status,
      companionId: intent.companion_id,
      amount: intent.amount,
      completedAt: intent.completed_at,
      expiresAt: intent.expires_at,
      tipId: intent.tip_id || null,
      thankYouReady,
    });
  } catch (err) {
    console.error('[billing] ios tip intent status error:', err.message);
    res.status(500).json({ error: 'Failed to load iOS tip intent' });
  }
});

// -- Card payments are off (owner decision 2026-11-04) --
// Subscriptions and in-app extras are sold only through App Store purchases in the iOS app.
// These were the card-checkout endpoints; they now refuse instead of creating a session.
const APP_STORE_URL = 'https://apps.apple.com/app/id6760726614';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=ai.lovetta.app';
router.post(['/portal', '/subscribe', '/tip'], (_req, res) => {
  res.status(410).json({ error: 'Card payments are not available. Subscriptions are available in the app for iPhone and Android.', appStoreUrl: APP_STORE_URL, playStoreUrl: PLAY_STORE_URL });
});

module.exports = router;
