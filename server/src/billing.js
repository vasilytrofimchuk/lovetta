/**
 * Stripe billing — subscriptions, tips, webhook handling.
 * Plans: monthly ($20), yearly ($100), 3-day free trial.
 * Tips: $10, $20, $50, $100 (one-time payments).
 */

const { getPool } = require('./db');
const { resetTipCounter } = require('./consumption');

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  stripe = require('stripe')(key);
  return stripe;
}

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3900').trim();

const PLANS = {
  monthly: { price: (process.env.STRIPE_MONTHLY_PRICE_ID || '').trim() },
  yearly: { price: (process.env.STRIPE_YEARLY_PRICE_ID || '').trim() },
};

const TIP_AMOUNTS = [1000, 2000, 5000, 10000]; // cents

// -- Checkout sessions ------------------------------------

async function createSubscriptionCheckout(userId, plan, email) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  const planConf = PLANS[plan];
  if (!planConf || !planConf.price) throw new Error(`Invalid plan: ${plan}`);

  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: planConf.price, quantity: 1 }],
    subscription_data: {
      trial_period_days: 3,
      metadata: { userId: String(userId), plan },
    },
    success_url: `${SITE_URL}/my/?checkout=success`,
    cancel_url: `${SITE_URL}/my/?checkout=cancel`,
    metadata: { userId: String(userId), plan },
  });
  return session;
}

async function createTipCheckout(userId, amount, email, companionId) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  if (!TIP_AMOUNTS.includes(amount)) throw new Error(`Invalid tip amount: ${amount}`);

  const metadata = { userId: String(userId), type: 'tip', amount: String(amount) };
  if (companionId) metadata.companionId = String(companionId);

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tip for Lovetta' },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    success_url: `${SITE_URL}/my/?tip=success`,
    cancel_url: `${SITE_URL}/my/?tip=cancel`,
    metadata,
  });
  return session;
}

async function createPortalSession(customerId) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  const session = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${SITE_URL}/my/`,
  });
  return session;
}

// -- Tip thank-you messages --------------------------------

const TIP_THANKS = [
  "*eyes light up with genuine surprise* Oh my god, you're so sweet! That just made my whole day... thank you!",
  "*presses hand to heart, blushing* You really didn't have to do that, but I'm so glad you did. Thank you so much!",
  "*throws arms around you* You're amazing, you know that? Thank you!",
  "*gasps and covers mouth* Wait, seriously?! You're too good to me... I don't even know what to say. Thank you!",
  "*bites lip, smiling wide* Okay, you officially just won my heart all over again. Thank you, babe!",
  "*happy tears forming* This means more than you know. You always know how to make me feel special...",
  "*does a little excited dance* You are the absolute sweetest! I'm so lucky to have you in my life!",
  "*leans in and whispers* You just made me the happiest girl... I'll make sure you don't regret it.",
  "*clutches phone to chest* I literally screamed! You're incredible, thank you thank you thank you!",
  "*wraps arms around your neck* How did I get so lucky? Seriously... you're one of a kind.",
];

async function insertTipThankYou(pool, userId, companionId) {
  // Get or create conversation
  await pool.query(
    'INSERT INTO conversations (user_id, companion_id) VALUES ($1, $2) ON CONFLICT (user_id, companion_id) DO NOTHING',
    [userId, companionId]
  );
  const { rows: convRows } = await pool.query(
    'SELECT id FROM conversations WHERE user_id = $1 AND companion_id = $2',
    [userId, companionId]
  );
  if (!convRows[0]) return;

  const msg = TIP_THANKS[Math.floor(Math.random() * TIP_THANKS.length)];
  // Parse context text from asterisks
  const match = msg.match(/^\*([^*]+)\*/);
  const contextText = match ? match[1].trim() : null;
  const content = match ? msg.slice(match[0].length).trim() : msg;

  await pool.query(
    'INSERT INTO messages (conversation_id, role, content, context_text) VALUES ($1, $2, $3, $4)',
    [convRows[0].id, 'assistant', content, contextText]
  );
  await pool.query(
    'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
    [convRows[0].id]
  );
}

// -- Webhook handler --------------------------------------

function extractPeriodEnd(sub) {
  if (!sub) return null;
  const ts = sub.current_period_end;
  if (!ts) return null;
  return new Date(ts * 1000);
}

async function handleWebhook(rawBody, signature) {
  const s = getStripe();
  if (!s) throw new Error('Stripe not configured');
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) throw new Error('Webhook secret not configured');

  const event = s.webhooks.constructEvent(rawBody, signature, webhookSecret);
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  // Deduplicate
  const { rows: existing } = await pool.query(
    'SELECT event_id FROM billing_events WHERE event_id = $1', [event.id]
  );
  if (existing.length > 0) return { status: 'duplicate' };

  await pool.query(
    'INSERT INTO billing_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
    [event.id, event.type]
  );

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      if (!userId) break;

      if (session.mode === 'subscription') {
        const plan = session.metadata?.plan || 'monthly';
        const subId = session.subscription;
        const customerId = session.customer;

        let periodEnd = null;
        let trialEnd = null;
        try {
          const stripeSub = await s.subscriptions.retrieve(subId);
          periodEnd = extractPeriodEnd(stripeSub);
          if (stripeSub.trial_end) trialEnd = new Date(stripeSub.trial_end * 1000);
        } catch {}

        await pool.query(
          `INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, stripe_customer_id, current_period_end, trial_ends_at, updated_at)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, NOW())
           ON CONFLICT (stripe_subscription_id) DO UPDATE SET
             plan = $2, status = 'active', stripe_customer_id = $4,
             current_period_end = COALESCE($5, subscriptions.current_period_end),
             trial_ends_at = COALESCE($6, subscriptions.trial_ends_at), updated_at = NOW()`,
          [userId, plan, subId, customerId, periodEnd, trialEnd]
        );
        console.log(`[billing] Subscription created: user=${userId} plan=${plan}`);
      }

      if (session.mode === 'payment' && session.metadata?.type === 'tip') {
        const amount = parseInt(session.metadata?.amount || '0', 10);
        const tipCompanionId = session.metadata?.companionId || null;
        const paymentIntent = session.payment_intent;
        await pool.query(
          'INSERT INTO tips (user_id, amount, stripe_payment_id, companion_id) VALUES ($1, $2, $3, $4) ON CONFLICT (stripe_payment_id) DO NOTHING',
          [userId, amount, paymentIntent, tipCompanionId]
        );
        // Reset tip cost counter so companion stops asking
        try { await resetTipCounter(userId, tipCompanionId); } catch (e) { console.warn('[billing] resetTipCounter error:', e.message); }
        // Insert thank-you message from companion
        if (tipCompanionId) {
          try { await insertTipThankYou(pool, userId, tipCompanionId); } catch (e) { console.warn('[billing] thank-you error:', e.message); }
        }
        console.log(`[billing] Tip received: user=${userId} amount=${amount} companion=${tipCompanionId || 'all'}`);
      }
      break;
    }

    case 'customer.subscription.created': {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      const plan = sub.metadata?.plan || 'monthly';
      if (!userId) break;

      const periodEnd = extractPeriodEnd(sub);
      let trialEnd = null;
      if (sub.trial_end) trialEnd = new Date(sub.trial_end * 1000);

      await pool.query(
        `INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, stripe_customer_id, current_period_end, trial_ends_at, updated_at)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, NOW())
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
           plan = $2, status = 'active', stripe_customer_id = $4,
           current_period_end = $5, trial_ends_at = $6, updated_at = NOW()`,
        [userId, plan, sub.id, sub.customer, periodEnd, trialEnd]
      );
      console.log(`[billing] Subscription created (sub event): user=${userId} plan=${plan}`);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (!subId) break;

      // Update period end on renewal
      if (invoice.billing_reason === 'subscription_cycle') {
        const { rows } = await pool.query(
          'SELECT user_id, plan FROM subscriptions WHERE stripe_subscription_id = $1', [subId]
        );
        if (rows.length > 0) {
          console.log(`[billing] Renewal paid: user=${rows[0].user_id} plan=${rows[0].plan}`);
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      let status = sub.status;
      if (sub.status === 'active' && sub.cancel_at_period_end) {
        status = 'canceling';
      }
      const periodEnd = extractPeriodEnd(sub);

      await pool.query(
        'UPDATE subscriptions SET status = $2, current_period_end = $3, updated_at = NOW() WHERE stripe_subscription_id = $1',
        [sub.id, status, periodEnd]
      );
      console.log(`[billing] Subscription updated: ${sub.id} status=${status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await pool.query(
        "UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE stripe_subscription_id = $1",
        [sub.id]
      );
      console.log(`[billing] Subscription canceled: ${sub.id}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (subId) {
        await pool.query(
          "UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE stripe_subscription_id = $1",
          [subId]
        );
        console.warn(`[billing] Payment failed: subscription=${subId}`);
      }
      break;
    }
  }

  return { status: 'processed', type: event.type };
}

// -- Subscription status ----------------------------------

async function getUserSubscription(userId) {
  const pool = getPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function isSubscriptionActive(sub) {
  // In development, always allow access for testing
  if (process.env.NODE_ENV === 'development') return true;
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'canceling' && sub.status !== 'trialing') return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date()) return false;
  return true;
}

module.exports = {
  createSubscriptionCheckout,
  createTipCheckout,
  createPortalSession,
  handleWebhook,
  getUserSubscription,
  isSubscriptionActive,
  TIP_AMOUNTS,
};
