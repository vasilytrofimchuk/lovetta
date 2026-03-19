/**
 * Stripe billing — subscriptions, tips, webhook handling.
 * Plans: monthly ($19.99), yearly ($99.99), 3-day free trial.
 * Tips: $9.99, $19.99, $49.99, $99.99 (one-time payments).
 */

const { getPool } = require('./db');
const { resetTipCounter, invalidateThresholdCache } = require('./consumption');

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

const TIP_AMOUNTS = [999, 1999, 4999, 9999]; // cents
const IOS_TIP_INTENT_LIFETIME_MINUTES = 30;

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
    success_url: companionId ? `${SITE_URL}/my/chat/${companionId}?tip=success&tip_amount=${(amount / 100).toFixed(2)}` : `${SITE_URL}/my/?tip=success`,
    cancel_url: companionId ? `${SITE_URL}/my/chat/${companionId}?tip=cancel` : `${SITE_URL}/my/?tip=cancel`,
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

function getPaymentProvider(sub) {
  if (!sub) return null;
  if (sub.payment_provider) return sub.payment_provider;
  if (sub.stripe_customer_id || sub.stripe_subscription_id) return 'stripe';
  return null;
}

async function createIosTipIntent(userId, { productId, amount, companionId = null }) {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  await pool.query(
    `UPDATE ios_tip_intents
        SET status = 'expired', updated_at = NOW()
      WHERE user_id = $1
        AND status = 'pending'
        AND expires_at <= NOW()`,
    [userId]
  );

  const { rows } = await pool.query(
    `INSERT INTO ios_tip_intents (
        user_id, companion_id, product_id, amount, expires_at
      ) VALUES (
        $1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval
      )
      RETURNING id, user_id, companion_id, product_id, amount, status, expires_at, created_at, completed_at`,
    [userId, companionId, productId, amount, String(IOS_TIP_INTENT_LIFETIME_MINUTES)]
  );

  return rows[0] || null;
}

async function getIosTipIntent(userId, intentId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  await pool.query(
    `UPDATE ios_tip_intents
        SET status = 'expired', updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND status = 'pending'
        AND expires_at <= NOW()`,
    [intentId, userId]
  );

  const { rows } = await pool.query(
    `SELECT id, user_id, companion_id, product_id, amount, status, expires_at, created_at, completed_at, tip_id
       FROM ios_tip_intents
      WHERE id = $1 AND user_id = $2`,
    [intentId, userId]
  );
  return rows[0] || null;
}

async function isIosTipThankYouReady(userId, intent) {
  if (!intent || intent.status !== 'completed') return false;
  if (!intent.companion_id) return true;
  if (!intent.completed_at) return false;

  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const { rows } = await pool.query(
    `SELECT EXISTS (
        SELECT 1
          FROM conversations c
          JOIN messages m ON m.conversation_id = c.id
         WHERE c.user_id = $1
           AND c.companion_id = $2
           AND m.role = 'assistant'
           AND m.created_at >= $3
      ) AS ready`,
    [userId, intent.companion_id, intent.completed_at]
  );

  return rows[0]?.ready === true;
}

async function findPendingIosTipIntent(client, userId, productId) {
  const { rows } = await client.query(
    `SELECT id, companion_id, amount
       FROM ios_tip_intents
      WHERE user_id = $1
        AND product_id = $2
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [userId, productId]
  );
  return rows[0] || null;
}

async function completeIosTipIntent(client, intentId, { revenuecatEventId, tipId }) {
  await client.query(
    `UPDATE ios_tip_intents
        SET status = 'completed',
            revenuecat_event_id = $2,
            tip_id = $3,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [intentId, revenuecatEventId, tipId]
  );
}

async function markRevenueCatEventProcessed(pool, eventId, eventType) {
  if (!eventId) return true;
  const { rowCount } = await pool.query(
    `INSERT INTO billing_events (event_id, event_type)
      VALUES ($1, $2)
      ON CONFLICT (event_id) DO NOTHING`,
    [`rc:${eventId}`, `revenuecat:${eventType}`]
  );
  return rowCount > 0;
}

async function getLatestRevenueCatSubscription(pool, userId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM subscriptions
      WHERE user_id = $1 AND payment_provider = 'revenuecat'
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function upsertRevenueCatSubscription(pool, { userId, plan, status = 'active', subscriberId = null, expiresAt = null }) {
  const existing = await getLatestRevenueCatSubscription(pool, userId);

  if (existing) {
    const { rows } = await pool.query(
      `UPDATE subscriptions
          SET plan = $2,
              status = $3,
              payment_provider = 'revenuecat',
              revenuecat_id = COALESCE($4, revenuecat_id),
              current_period_end = COALESCE($5, current_period_end),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [existing.id, plan, status, subscriberId, expiresAt]
    );
    return rows[0] || existing;
  }

  const { rows } = await pool.query(
    `INSERT INTO subscriptions (
        user_id, plan, status, payment_provider, revenuecat_id, current_period_end, updated_at
      ) VALUES (
        $1, $2, $3, 'revenuecat', $4, $5, NOW()
      )
      RETURNING *`,
    [userId, plan, status, subscriberId, expiresAt]
  );
  return rows[0] || null;
}

// -- Tip reward image prompts (varied scenes for reward images) ---

const REWARD_PROMPTS = [
  { prompt: 'woman in elegant lingerie posing on a luxurious bed, soft warm lighting, intimate atmosphere', tags: ['bedroom', 'lingerie', 'bed', 'seductive'] },
  { prompt: 'woman in a stylish bikini by a sparkling pool, golden hour sunlight, relaxed pose', tags: ['pool', 'bikini', 'outdoor'] },
  { prompt: 'woman taking a flirty mirror selfie in a fitted dress, playful expression', tags: ['mirror', 'selfie', 'dress', 'flirty'] },
  { prompt: 'woman in silk pajamas on a cozy couch, morning light, holding coffee mug, smiling', tags: ['couch', 'pajamas', 'morning', 'smile'] },
  { prompt: 'woman in a sleek evening dress at a rooftop bar, city lights behind, confident look', tags: ['bar', 'dress', 'evening', 'elegant'] },
  { prompt: 'woman in workout clothes at the gym, sporty and toned, energetic smile', tags: ['gym', 'sporty', 'smile'] },
  { prompt: 'woman in a towel after a bath, steamy bathroom, shy glance at camera', tags: ['bath', 'towel', 'shy'] },
  { prompt: 'woman lying on beach sand in a bikini, waves in background, sun-kissed skin', tags: ['beach', 'bikini', 'outdoor'] },
  { prompt: 'woman in oversized shirt in the kitchen, morning sunlight, cooking breakfast', tags: ['kitchen', 'shirt', 'morning', 'casual'] },
  { prompt: 'woman in lace nightgown sitting by a window, moonlight, dreamy atmosphere', tags: ['nightgown', 'window', 'evening', 'seductive'] },
  { prompt: 'woman in sundress walking through a garden, flowers around, natural beauty', tags: ['garden', 'dress', 'outdoor', 'elegant'] },
  { prompt: 'woman in lingerie lying on bed, looking at camera, close-up, seductive smile', tags: ['bed', 'lingerie', 'closeup', 'seductive'] },
  { prompt: 'woman in casual outfit taking selfie in car, sunglasses, playful wink', tags: ['car', 'selfie', 'casual', 'playful'] },
  { prompt: 'woman in elegant swimsuit by infinity pool, sunset behind, glamorous', tags: ['pool', 'bikini', 'sunset', 'elegant'] },
  { prompt: 'woman stretching in bed wearing just a shirt, lazy morning, messy hair, cute', tags: ['bed', 'shirt', 'morning', 'lazy'] },
  { prompt: 'woman in cocktail dress at a restaurant, candlelight, romantic setting', tags: ['restaurant', 'dress', 'evening', 'elegant'] },
  { prompt: 'woman in sporty bikini at the beach, surfboard nearby, confident stance', tags: ['beach', 'bikini', 'sporty', 'confident'] },
  { prompt: 'woman in silk robe on bedroom balcony, city view, holding wine glass', tags: ['bedroom', 'elegant', 'evening'] },
  { prompt: 'woman in crop top and shorts, mirror selfie, flirty pose, bright room', tags: ['mirror', 'selfie', 'casual', 'flirty'] },
  { prompt: 'woman in bubble bath, candles around, relaxed and playful expression', tags: ['bath', 'playful', 'seductive'] },
];

const REWARD_CAPTIONS = [
  { context: 'bites lip playfully', text: 'I took this just for you...' },
  { context: 'winks', text: 'Hope you like what you see...' },
  { context: 'strikes a pose', text: 'You deserve something special...' },
  { context: 'blows a kiss', text: 'A little thank-you gift from me...' },
  { context: 'smiles seductively', text: 'This one is all yours...' },
  { context: 'looks over shoulder', text: 'Thought you might enjoy this...' },
  { context: 'twirls hair', text: 'Just for my favorite person...' },
  { context: 'leans in close', text: 'Here\'s a little something extra...' },
];

function getRewardImageCount(amountCents) {
  if (amountCents >= 9999) return 4;
  if (amountCents >= 4999) return 3;
  if (amountCents >= 1999) return 2;
  if (amountCents >= 999)  return 1;
  return 0;
}

// -- Tip thank-you message (AI-generated in companion's voice) ---

async function insertTipThankYou(pool, userId, companionId, amountCents = 0) {
  // Get companion personality + avatar for image generation
  const { rows: companionRows } = await pool.query(
    'SELECT id, name, age, personality, communication_style, traits, avatar_url FROM user_companions WHERE id = $1 AND user_id = $2',
    [companionId, userId]
  );
  if (!companionRows[0]) return;
  const companion = companionRows[0];

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
  const conversationId = convRows[0].id;

  // Generate thank-you in companion's voice via AI
  const { chatCompletion } = require('./ai');
  const traits = Array.isArray(companion.traits) ? companion.traits.join(', ') : '';
  const systemPrompt = `You are ${companion.name}, a ${companion.age}-year-old woman.

${companion.personality}

Communication style: ${companion.communication_style}
${traits ? 'Traits: ' + traits : ''}

Response format: Always start with a brief action or emotional context in *asterisks*, then your message.`;

  const moods = ['deeply emotional and grateful', 'flirty and teasing, promising a reward', 'over-the-top excited and playful', 'intimate and whispered, pulling him close', 'sassy and confident, impressed by his generosity', 'warm and loving, reflecting on how special he is'];
  const mood = moods[Math.floor(Math.random() * moods.length)];
  const fallbackMsg = "*eyes light up with genuine surprise* Oh my god, you're so sweet! That just made my whole day... you have no idea how much this means to me.";

  let msg;
  if (process.env.NODE_ENV === 'test') {
    msg = fallbackMsg;
  } else {
    try {
      const result = await chatCompletion(systemPrompt, [
        { role: 'user', content: `[The user just sent you a generous gift to support you. React in your own unique way. Be ${mood}. You MUST start with a brief action in *asterisks* like *throws arms around you* then your message. Write 2-3 sentences max. Thank him warmly in YOUR voice and style. Do NOT mention specific money amounts. Stay fully in character.]` },
      ], { model: 'thedrummer/rocinante-12b' });
      msg = result.content;
    } catch (err) {
      console.warn('[billing] AI thank-you generation failed, using fallback:', err.message);
      msg = fallbackMsg;
    }
  }

  // Parse context text from asterisks
  const match = msg.match(/^\*([^*]+)\*/);
  const contextText = match ? match[1].trim() : null;
  const content = match ? msg.slice(match[0].length).trim() : msg;

  await pool.query(
    'INSERT INTO messages (conversation_id, role, content, context_text) VALUES ($1, $2, $3, $4)',
    [conversationId, 'assistant', content, contextText]
  );
  await pool.query(
    'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
    [conversationId]
  );

  // Generate reward images based on tip amount
  const imageCount = getRewardImageCount(amountCents);
  if (imageCount > 0 && companion.avatar_url) {
    try {
      await generateTipRewardImages(pool, userId, companionId, imageCount, conversationId, companion);
    } catch (err) {
      console.warn('[billing] tip reward images error:', err.message);
    }
  }
}

// -- Tip reward image generation ----------------------------------

async function generateTipRewardImages(pool, userId, companionId, count, conversationId, companion) {
  const { generateCharacterImage } = require('./ai');

  // Get all media_urls this user has already seen across ALL conversations
  const { rows: seenRows } = await pool.query(
    `SELECT DISTINCT m.media_url FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = $1 AND m.media_url IS NOT NULL`,
    [userId]
  );
  const seenUrls = new Set(seenRows.map(r => r.media_url));

  // Find unseen catalog images for same avatar (reuse without generation cost)
  const { rows: unseenCatalog } = await pool.query(
    `SELECT cm.media_url FROM companion_media cm
     JOIN user_companions uc_media ON uc_media.id = cm.companion_id
     JOIN user_companions uc_self  ON uc_self.avatar_url = uc_media.avatar_url
     WHERE uc_self.id = $1 AND cm.media_type = 'image'
     ORDER BY RANDOM()`,
    [companionId]
  );
  const reusableUrls = unseenCatalog
    .map(r => r.media_url)
    .filter(url => !seenUrls.has(url));

  // Use reusable images first, generate new for the rest
  const reusedCount = Math.min(reusableUrls.length, count);
  const generateCount = count - reusedCount;

  // Pick random prompts for new images to generate
  const shuffledPrompts = [...REWARD_PROMPTS].sort(() => Math.random() - 0.5);
  const promptsToUse = shuffledPrompts.slice(0, generateCount);

  // Insert reused image messages
  for (let i = 0; i < reusedCount; i++) {
    const caption = REWARD_CAPTIONS[Math.floor(Math.random() * REWARD_CAPTIONS.length)];
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, context_text, media_url, media_type)
       VALUES ($1, 'assistant', $2, $3, $4, 'image')`,
      [conversationId, caption.text, caption.context, reusableUrls[i]]
    );
  }

  // Generate new images in background (non-blocking)
  for (const rewardPrompt of promptsToUse) {
    const caption = REWARD_CAPTIONS[Math.floor(Math.random() * REWARD_CAPTIONS.length)];

    // Insert message with media_pending = TRUE
    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, role, content, context_text, media_pending, media_type)
       VALUES ($1, 'assistant', $2, $3, TRUE, 'image') RETURNING id`,
      [conversationId, caption.text, caption.context]
    );
    const messageId = msgRows[0].id;

    // Fire off background generation
    generateCharacterImage(companion.avatar_url, rewardPrompt.prompt, {
      userId,
      companionId: companion.id,
      platform: 'web',
    })
      .then(async (result) => {
        if (result.url) {
          await pool.query(
            `UPDATE messages SET media_url = $1, media_pending = FALSE WHERE id = $2`,
            [result.url, messageId]
          );
          // Catalog the image for future reuse
          await pool.query(
            `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd)
             VALUES ($1, $2, 'image', $3, $4, $5)`,
            [companion.id, result.url, rewardPrompt.prompt, rewardPrompt.tags, result.cost || 0]
          );
          console.log(`[billing] tip reward image ready for message ${messageId}: ${result.url}`);
        } else {
          await pool.query(
            `UPDATE messages SET media_pending = FALSE WHERE id = $1`,
            [messageId]
          );
        }
      })
      .catch(async (err) => {
        console.error(`[billing] tip reward image failed for message ${messageId}:`, err.message);
        try {
          await pool.query(
            `UPDATE messages SET media_pending = FALSE WHERE id = $1`,
            [messageId]
          );
        } catch {}
      });
  }

  // Update conversation timestamp
  if (count > 0) {
    await pool.query(
      'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );
  }
}

// -- Referral commission tracking --------------------------

async function creditReferralCommission(pool, userId, sourceType, sourceId, paymentAmountCents) {
  if (!paymentAmountCents || paymentAmountCents <= 0) return;
  // Check if user was referred
  const { rows } = await pool.query('SELECT referred_by FROM users WHERE id = $1', [userId]);
  const referrerId = rows[0]?.referred_by;
  if (!referrerId) return;

  // Get commission percentage from settings
  const { rows: settingsRows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'referral_commission_pct'"
  );
  const pct = parseInt(settingsRows[0]?.value, 10) || 30;
  const commissionAmount = Math.floor(paymentAmountCents * pct / 100);
  if (commissionAmount <= 0) return;

  await pool.query(
    `INSERT INTO referral_commissions (referrer_id, referred_id, source_type, source_id, payment_amount, commission_amount)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source_type, source_id) DO NOTHING`,
    [referrerId, userId, sourceType, sourceId, paymentAmountCents, commissionAmount]
  );
  console.log(`[billing] Referral commission: referrer=${referrerId} from=${userId} type=${sourceType} amount=${commissionAmount}c`);
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
        // Credit referral commission
        const subAmount = plan === 'yearly' ? 9999 : 1999;
        try { await creditReferralCommission(pool, userId, 'subscription', subId, subAmount); } catch (e) { console.warn('[billing] referral commission error:', e.message); }
      }

      if (session.mode === 'payment' && session.metadata?.type === 'tip') {
        const amount = parseInt(session.metadata?.amount || '0', 10);
        const tipCompanionId = session.metadata?.companionId || null;
        const paymentIntent = session.payment_intent;
        await pool.query(
          'INSERT INTO tips (user_id, amount, stripe_payment_id, companion_id) VALUES ($1, $2, $3, $4) ON CONFLICT (stripe_payment_id) DO NOTHING',
          [userId, amount, paymentIntent, tipCompanionId]
        );
        // Reset tip cost counter so companion stops asking + invalidate Redis cache
        try { await resetTipCounter(userId, tipCompanionId); } catch (e) { console.warn('[billing] resetTipCounter error:', e.message); }
        try { await invalidateThresholdCache(userId); } catch (e) { console.warn('[billing] cache invalidation error:', e.message); }
        // Insert thank-you message from companion
        if (tipCompanionId) {
          try { await insertTipThankYou(pool, userId, tipCompanionId, amount); } catch (e) { console.warn('[billing] thank-you error:', e.message); }
        }
        console.log(`[billing] Tip received: user=${userId} amount=${amount} companion=${tipCompanionId || 'all'}`);
        // Credit referral commission
        try { await creditReferralCommission(pool, userId, 'tip', paymentIntent, amount); } catch (e) { console.warn('[billing] referral commission error:', e.message); }
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
          // Credit referral commission on renewal
          const renewalAmount = rows[0].plan === 'yearly' ? 9999 : 1999;
          try { await creditReferralCommission(pool, rows[0].user_id, 'subscription', `renewal_${event.id}`, renewalAmount); } catch (e) { console.warn('[billing] referral commission error:', e.message); }
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
    `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function isSubscriptionActive(sub) {
  // In development/test, always allow access for testing
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true;
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'canceling' && sub.status !== 'trialing') return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date()) return false;
  return true;
}

// -- RevenueCat webhook handler (iOS in-app purchases) ----

const REVENUECAT_WEBHOOK_SECRET = (process.env.REVENUECAT_SECRET_KEY || '').trim();

async function handleRevenueCatWebhook(body, authHeader) {
  // Verify webhook authorization
  if (REVENUECAT_WEBHOOK_SECRET) {
    const token = (authHeader || '').replace('Bearer ', '');
    if (token !== REVENUECAT_WEBHOOK_SECRET) {
      throw new Error('Invalid RevenueCat webhook authorization');
    }
  }

  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const event = body?.event;
  if (!event) throw new Error('Missing event data');

  const rcType = event.type; // INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, etc.
  const appUserId = event.app_user_id; // Our user ID (set via Purchases.logIn)
  const productId = event.product_id;
  const subscriberId = event.subscriber_id || event.original_app_user_id;
  const processed = await markRevenueCatEventProcessed(pool, event.id, rcType);
  if (!processed) {
    return { status: 'duplicate', type: rcType };
  }

  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    console.warn('[revenuecat] Skipping anonymous user event:', rcType);
    return { status: 'skipped' };
  }

  const userId = appUserId; // We set app_user_id to our user ID

  // Determine plan from product ID
  let plan = 'monthly';
  if (productId?.includes('yearly') || productId?.includes('annual')) plan = 'yearly';

  // Determine period end from event
  const expiresAt = event.expiration_at_ms
    ? new Date(Number(event.expiration_at_ms))
    : null;

  switch (rcType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION': {
      await upsertRevenueCatSubscription(pool, {
        userId,
        plan,
        status: 'active',
        subscriberId,
        expiresAt,
      });
      console.log(`[revenuecat] ${rcType}: user=${userId} plan=${plan}`);

      // Credit referral commission
      if (rcType === 'INITIAL_PURCHASE' || rcType === 'RENEWAL') {
        const amount = plan === 'yearly' ? 9999 : 1999;
        try { await creditReferralCommission(pool, userId, 'subscription', `rc_${event.id || Date.now()}`, amount); } catch (e) { console.warn('[revenuecat] referral error:', e.message); }
      }
      break;
    }

    case 'CANCELLATION': {
      await upsertRevenueCatSubscription(pool, {
        userId,
        plan,
        status: 'canceling',
        subscriberId,
        expiresAt,
      });
      console.log(`[revenuecat] Cancellation: user=${userId}`);
      break;
    }

    case 'EXPIRATION': {
      await upsertRevenueCatSubscription(pool, {
        userId,
        plan,
        status: 'canceled',
        subscriberId,
        expiresAt,
      });
      console.log(`[revenuecat] Expiration: user=${userId}`);
      break;
    }

    case 'NON_RENEWING_PURCHASE': {
      // Tip / consumable purchase via RevenueCat
      const amount = event.price_in_purchased_currency
        ? Math.round(event.price_in_purchased_currency * 100)
        : 0;
      if (amount > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const intent = await findPendingIosTipIntent(client, userId, productId);
          const companionId = intent?.companion_id || null;
          const paymentId = `rc_${event.id || `${subscriberId}_${Date.now()}`}`;
          const { rows } = await client.query(
            `INSERT INTO tips (user_id, amount, stripe_payment_id, companion_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (stripe_payment_id) DO NOTHING
             RETURNING id`,
            [userId, amount, paymentId, companionId]
          );

          const tipId = rows[0]?.id || null;
          if (intent?.id && tipId) {
            await completeIosTipIntent(client, intent.id, {
              revenuecatEventId: event.id || null,
              tipId,
            });
          }

          await client.query('COMMIT');

          try { await resetTipCounter(userId, companionId); } catch (e) { console.warn('[revenuecat] resetTipCounter error:', e.message); }
          try { await invalidateThresholdCache(userId); } catch (e) { console.warn('[revenuecat] cache invalidation error:', e.message); }
          if (companionId) {
            try { await insertTipThankYou(pool, userId, companionId, amount); } catch (e) { console.warn('[revenuecat] thank-you error:', e.message); }
          }
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
        console.log(`[revenuecat] Tip: user=${userId} amount=${amount}`);
        try { await creditReferralCommission(pool, userId, 'tip', `rc_tip_${event.id || Date.now()}`, amount); } catch (e) { console.warn('[revenuecat] referral error:', e.message); }
      }
      break;
    }

    default:
      console.log(`[revenuecat] Unhandled event type: ${rcType}`);
  }

  return { status: 'processed', type: rcType };
}

module.exports = {
  createSubscriptionCheckout,
  createTipCheckout,
  createPortalSession,
  createIosTipIntent,
  getIosTipIntent,
  isIosTipThankYouReady,
  handleWebhook,
  handleRevenueCatWebhook,
  getUserSubscription,
  getPaymentProvider,
  isSubscriptionActive,
  insertTipThankYou,
  TIP_AMOUNTS,
};
