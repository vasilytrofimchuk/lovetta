/**
 * Billing API — subscription management, tips, billing portal.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const {
  createSubscriptionCheckout,
  createTipCheckout,
  createIosTipIntent,
  createPortalSession,
  getIosTipIntent,
  isIosTipThankYouReady,
  getPaymentProvider,
  getUserSubscription,
  isSubscriptionActive,
  TIP_AMOUNTS,
} = require('./billing');

const router = Router();

// -- GET /api/billing/status ------------------------------
router.get('/status', authenticate, async (req, res) => {
  try {
    const sub = await getUserSubscription(req.userId);
    const active = isSubscriptionActive(sub);

    res.json({
      hasSubscription: active,
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

// -- POST /api/billing/subscribe --------------------------
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Use: monthly, yearly' });
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const session = await createSubscriptionCheckout(req.userId, plan, rows[0].email);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// -- POST /api/billing/tip --------------------------------
router.post('/tip', authenticate, async (req, res) => {
  try {
    const { amount, companionId } = req.body || {};
    const amountCents = parseInt(amount, 10);
    if (!TIP_AMOUNTS.includes(amountCents)) {
      return res.status(400).json({ error: `Invalid amount. Use: ${TIP_AMOUNTS.join(', ')} (in cents)` });
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const session = await createTipCheckout(req.userId, amountCents, rows[0].email, companionId || null);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] tip error:', err.message);
    res.status(500).json({ error: 'Failed to create tip session' });
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

// -- POST /api/billing/portal -----------------------------
router.post('/portal', authenticate, async (req, res) => {
  try {
    const sub = await getUserSubscription(req.userId);
    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const session = await createPortalSession(sub.stripe_customer_id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal error:', err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

module.exports = router;
