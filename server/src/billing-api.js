/**
 * Billing API — subscription management, tips, billing portal.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');
const {
  createSubscriptionCheckout,
  createTipCheckout,
  createPortalSession,
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
    const { amount } = req.body || {};
    const amountCents = parseInt(amount, 10);
    if (!TIP_AMOUNTS.includes(amountCents)) {
      return res.status(400).json({ error: `Invalid amount. Use: ${TIP_AMOUNTS.join(', ')} (in cents)` });
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const session = await createTipCheckout(req.userId, amountCents, rows[0].email);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] tip error:', err.message);
    res.status(500).json({ error: 'Failed to create tip session' });
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
