/**
 * Billing — App Store and Google Play subscriptions and purchases (RevenueCat). Card payments are off since 2026-11-04.
 * Plans: monthly ($19.99), yearly ($99.99), 3-day free trial.
 * Tips: $9.99, $19.99, $49.99, $99.99 (one-time payments).
 */

const { getPool } = require('./db');
const { resetTipCounter, invalidateThresholdCache } = require('./consumption');
const { firePayPostback } = require('./trafficstars');

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3900').trim();

const TIP_AMOUNTS = [999, 1999, 4999, 9999]; // cents
const IOS_TIP_INTENT_LIFETIME_MINUTES = 30;

/*
 * Store products (same ids in the App Store and Google Play; see web/src/lib/revenuecat.js).
 * Google Play subscriptions arrive from RevenueCat as "<subscriptionId>:<basePlanId>"
 * (e.g. "lovetta_yearly:yearly"); storeProductId() reduces both forms to the base id.
 */
const SUBSCRIPTION_PRODUCTS = { lovetta_monthly: 'monthly', lovetta_yearly: 'yearly' };
const TIP_PRODUCT_CENTS = {
  lovetta_tip_999: 999,
  lovetta_tip_1999: 1999,
  lovetta_tip_4999: 4999,
  lovetta_tip_9999: 9999,
};

function storeProductId(productId) {
  return String(productId || '').trim().split(':')[0];
}

function planForProduct(productId) {
  const id = storeProductId(productId);
  if (SUBSCRIPTION_PRODUCTS[id]) return SUBSCRIPTION_PRODUCTS[id];
  const full = String(productId || '');
  return (full.includes('yearly') || full.includes('annual')) ? 'yearly' : 'monthly';
}

/** RevenueCat event.store → our tracker source label. */
function storeSource(store) {
  return store === 'PLAY_STORE' ? 'android' : 'ios';
}

async function markRecentValuePromptsConverted(pool, userId) {
  if (!pool || !userId) return;
  try {
    await pool.query(
      `UPDATE value_prompt_events
       SET converted_at = COALESCE(converted_at, NOW())
       WHERE user_id = $1
         AND converted_at IS NULL
         AND created_at > NOW() - INTERVAL '14 days'`,
      [userId]
    );
  } catch (err) {
    console.warn('[billing] value prompt conversion update failed:', err.message);
  }
}

// -- Checkout sessions ------------------------------------

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
// racy: true — revealing scenes; never used at image level 0 (the store apps).

const REWARD_PROMPTS = [
  { prompt: 'woman in elegant lingerie posing on a luxurious bed, soft warm lighting, intimate atmosphere', tags: ['bedroom', 'lingerie', 'bed', 'seductive'], racy: true },
  { prompt: 'woman in a stylish bikini by a sparkling pool, golden hour sunlight, relaxed pose', tags: ['pool', 'bikini', 'outdoor'], racy: true },
  { prompt: 'woman taking a flirty mirror selfie in a fitted dress, playful expression', tags: ['mirror', 'selfie', 'dress', 'flirty'] },
  { prompt: 'woman in silk pajamas on a cozy couch, morning light, holding coffee mug, smiling', tags: ['couch', 'pajamas', 'morning', 'smile'] },
  { prompt: 'woman in a sleek evening dress at a rooftop bar, city lights behind, confident look', tags: ['bar', 'dress', 'evening', 'elegant'] },
  { prompt: 'woman in workout clothes at the gym, sporty and toned, energetic smile', tags: ['gym', 'sporty', 'smile'] },
  { prompt: 'woman in a towel after a bath, steamy bathroom, shy glance at camera', tags: ['bath', 'towel', 'shy'], racy: true },
  { prompt: 'woman lying on beach sand in a bikini, waves in background, sun-kissed skin', tags: ['beach', 'bikini', 'outdoor'], racy: true },
  { prompt: 'woman in oversized shirt in the kitchen, morning sunlight, cooking breakfast', tags: ['kitchen', 'shirt', 'morning', 'casual'] },
  { prompt: 'woman in lace nightgown sitting by a window, moonlight, dreamy atmosphere', tags: ['nightgown', 'window', 'evening', 'seductive'], racy: true },
  { prompt: 'woman in sundress walking through a garden, flowers around, natural beauty', tags: ['garden', 'dress', 'outdoor', 'elegant'] },
  { prompt: 'woman in lingerie lying on bed, looking at camera, close-up, seductive smile', tags: ['bed', 'lingerie', 'closeup', 'seductive'], racy: true },
  { prompt: 'woman in casual outfit taking selfie in car, sunglasses, playful wink', tags: ['car', 'selfie', 'casual', 'playful'] },
  { prompt: 'woman in elegant swimsuit by infinity pool, sunset behind, glamorous', tags: ['pool', 'bikini', 'sunset', 'elegant'], racy: true },
  { prompt: 'woman stretching in bed wearing just a shirt, lazy morning, messy hair, cute', tags: ['bed', 'shirt', 'morning', 'lazy'] },
  { prompt: 'woman in cocktail dress at a restaurant, candlelight, romantic setting', tags: ['restaurant', 'dress', 'evening', 'elegant'] },
  { prompt: 'woman in sporty bikini at the beach, surfboard nearby, confident stance', tags: ['beach', 'bikini', 'sporty', 'confident'], racy: true },
  { prompt: 'woman in silk robe on bedroom balcony, city view, holding wine glass', tags: ['bedroom', 'elegant', 'evening'], racy: true },
  { prompt: 'woman in crop top and shorts, mirror selfie, flirty pose, bright room', tags: ['mirror', 'selfie', 'casual', 'flirty'] },
  { prompt: 'woman in bubble bath, candles around, relaxed and playful expression', tags: ['bath', 'playful', 'seductive'], racy: true },
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
  const { chatCompletion, getAISettings } = require('./ai');
  const aiSettings = await getAISettings();
  const tipModel = aiSettings.tip_thankyou_model || 'qwen/qwen3-235b-a22b-2507';
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
      ], { model: tipModel });
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
  const { platformForUser, getEffectiveImageLevel } = require('./content-levels');
  // Android sign-ups get the Google Play level; everyone else keeps the web level (as before).
  const platform = await platformForUser(userId, 'web');
  const level = await getEffectiveImageLevel(platform, userId);

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
       AND COALESCE(cm.content_level, 2) <= $2
     ORDER BY RANDOM()`,
    [companionId, level]
  );
  const reusableUrls = unseenCatalog
    .map(r => r.media_url)
    .filter(url => !seenUrls.has(url));

  // Use reusable images first, generate new for the rest
  const reusedCount = Math.min(reusableUrls.length, count);
  const generateCount = count - reusedCount;

  // Pick random prompts for new images to generate
  const shuffledPrompts = REWARD_PROMPTS.filter(p => level > 0 || !p.racy).sort(() => Math.random() - 0.5);
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
      platform,
    })
      .then(async (result) => {
        if (result.url) {
          await pool.query(
            `UPDATE messages SET media_url = $1, media_pending = FALSE WHERE id = $2`,
            [result.url, messageId]
          );
          // Catalog the image for future reuse
          await pool.query(
            `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd, content_level)
             VALUES ($1, $2, 'image', $3, $4, $5, $6)`,
            [companion.id, result.url, rewardPrompt.prompt, rewardPrompt.tags, result.cost || 0, level]
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

// -- Subscription status ----------------------------------

async function getUserSubscription(userId) {
  const pool = getPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    // A row that still gives access wins over a newer one that does not. A user can hold two:
    // a subscription granted by support (grantSubscription) beside a store one — and a store
    // webhook touching the expired row must not lock them out of the gift.
    `SELECT * FROM subscriptions WHERE user_id = $1
      ORDER BY (status IN ('active', 'canceling', 'trialing')
                AND (current_period_end IS NULL OR current_period_end > NOW())) DESC,
               updated_at DESC, created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Give a user access for a number of months, on us — compensation decided by the owner in support.
 *
 * Its own row (payment_provider 'gift'), never an edit of a paid one: the store and Stripe
 * webhooks keep rewriting theirs, and a gift written into one would be undone by the next renewal
 * or cancellation event. A second grant extends the first from wherever it currently ends.
 */
async function grantSubscription(userId, { months, reason, grantedBy }) {
  const pool = getPool();
  if (!pool) throw new Error('No database');
  const n = parseInt(months, 10);
  if (!Number.isInteger(n) || n < 1 || n > 36) throw new Error('months must be 1..36');
  const why = String(reason || '').trim().slice(0, 500);
  if (!why) throw new Error('reason required');
  const { rows: users } = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (!users.length) throw new Error('user not found');

  const { rows: existing } = await pool.query(
    `SELECT id FROM subscriptions WHERE user_id = $1 AND payment_provider = 'gift' ORDER BY id DESC LIMIT 1`, [userId]
  );
  let sub;
  if (existing.length) {
    ({ rows: [sub] } = await pool.query(
      `UPDATE subscriptions
          SET status = 'active', updated_at = NOW(),
              current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(months => $2)
        WHERE id = $1 RETURNING *`,
      [existing[0].id, n]
    ));
  } else {
    ({ rows: [sub] } = await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, payment_provider, current_period_end, updated_at)
       VALUES ($1, 'yearly', 'active', 'gift', NOW() + make_interval(months => $2), NOW()) RETURNING *`,
      [userId, n]
    ));
  }
  await pool.query(
    `INSERT INTO subscription_grants (user_id, subscription_id, months, reason, granted_by) VALUES ($1, $2, $3, $4, $5)`,
    [userId, sub.id, n, why, String(grantedBy || 'admin').slice(0, 80)]
  );
  return sub;
}

function isSubscriptionActive(sub) {
  // In development/test, always allow access for testing.
  // Set PAYWALL_ENFORCE=1 to evaluate subscriptions for real locally — needed
  // to exercise the hard paywall, which is otherwise invisible in dev.
  if (!process.env.PAYWALL_ENFORCE
    && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) return true;
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'canceling' && sub.status !== 'trialing') return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date()) return false;
  return true;
}

// -- RevenueCat webhook handler (iOS in-app purchases) ----

const REVENUECAT_WEBHOOK_SECRET = (process.env.REVENUECAT_SECRET_KEY || '').trim();

/**
 * Ask RevenueCat directly whether this user owns an active subscription, and
 * write the result to our subscriptions table.
 *
 * Why this exists: unlocking used to depend entirely on the RevenueCat webhook
 * arriving before the client's 45s poll gave up. In the App Store sandbox that
 * race is routinely lost, which is what got 1.1 rejected under 2.1(b) — the
 * reviewer purchased successfully and the app stayed locked. Pulling the
 * entitlement over the REST API makes unlocking synchronous and independent of
 * webhook delivery; the webhook still handles renewals and cancellations.
 *
 * Returns the subscription row when active, or null. Never throws — callers
 * fall back to whatever the webhook has already recorded.
 */
const REVENUECAT_API = 'https://api.revenuecat.com/v2';
let rcProjectIdCache = process.env.REVENUECAT_PROJECT_ID || null;
let rcProductMapCache = null; // RevenueCat product id -> store identifier

async function rcGet(path, key) {
  const res = await fetch(REVENUECAT_API + path, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.warn(`[revenuecat] GET ${path} -> ${res.status}`);
    return null;
  }
  return res.json();
}

async function getRcProjectId(key) {
  if (rcProjectIdCache) return rcProjectIdCache;
  const list = await rcGet('/projects', key);
  rcProjectIdCache = list?.items?.[0]?.id || null;
  return rcProjectIdCache;
}

// RevenueCat's subscription objects reference products by RC id (prod…), not by
// the App Store identifier, so we need this map to tell monthly from yearly.
async function getRcProductMap(projectId, key) {
  if (rcProductMapCache) return rcProductMapCache;
  const list = await rcGet(`/projects/${projectId}/products`, key);
  if (!list?.items) return {};
  rcProductMapCache = {};
  for (const p of list.items) rcProductMapCache[p.id] = p.store_identifier || '';
  return rcProductMapCache;
}

async function syncRevenueCatSubscription(userId) {
  const pool = getPool();
  if (!pool || !userId) return null;
  const key = REVENUECAT_WEBHOOK_SECRET;
  if (!key.startsWith('sk_')) {
    console.warn('[revenuecat] REVENUECAT_SECRET_KEY is not a REST key — skipping direct sync');
    return null;
  }

  try {
    const projectId = await getRcProjectId(key);
    if (!projectId) return null;

    const subs = await rcGet(
      `/projects/${projectId}/customers/${encodeURIComponent(userId)}/subscriptions`, key
    );
    if (!subs?.items?.length) return null;

    // `gives_access` is RevenueCat's own verdict on whether this subscription
    // currently entitles the customer — true for sandbox purchases too, and it
    // covers trials and grace periods without us re-deriving the rules.
    // Entitlements are not configured on this project, so don't use them.
    const now = Date.now();
    let best = null;
    for (const s of subs.items) {
      const ends = Number(s.current_period_ends_at) || 0;
      const grants = s.gives_access === true || (ends > now && s.status !== 'expired');
      if (!grants) continue;
      if (!best || ends > Number(best.current_period_ends_at || 0)) best = s;
    }
    if (!best) return null;

    const products = await getRcProductMap(projectId, key);
    const storeId = products[best.product_id] || best.product_id || '';
    const plan = /yearly|annual/i.test(storeId) ? 'yearly' : 'monthly';
    const status = best.auto_renewal_status === 'will_not_renew' ? 'canceling' : 'active';
    const expiresAt = Number(best.current_period_ends_at)
      ? new Date(Number(best.current_period_ends_at)) : null;

    const row = await upsertRevenueCatSubscription(pool, {
      userId, plan, status,
      subscriberId: best.original_customer_id || userId,
      expiresAt,
    });
    console.log(`[revenuecat] direct sync: user=${userId} plan=${plan} status=${status}`
      + `${best.environment === 'sandbox' ? ' [SANDBOX]' : ''}`);
    try { await markRecentValuePromptsConverted(pool, userId); } catch {}
    return row;
  } catch (err) {
    console.warn('[revenuecat] direct sync error:', err.message);
    return null;
  }
}

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
  const isSandbox = event.environment === 'SANDBOX';
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
  // App Store id or Google Play "subscription:basePlan"
  const plan = planForProduct(productId);
  const source = storeSource(event.store);

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
      await markRecentValuePromptsConverted(pool, userId);
      console.log(`[revenuecat] ${rcType}: user=${userId} plan=${plan}`);

      // Tracker event for initial iOS purchase (production only — sandbox renewals fire daily and pollute analytics)
      if (rcType === 'INITIAL_PURCHASE' && !isSandbox) {
        pool.query('SELECT email FROM users WHERE id = $1', [userId]).then(({ rows }) => {
          if (rows[0]) {
            fetch('https://selectic.games/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': process.env.TRACKER_TOKEN || '' }, body: JSON.stringify({ projectId: 'lovetta', eventType: 'subscription', userEmail: rows[0].email, meta: { plan, amount: plan === 'yearly' ? 99.99 : 19.99, source, trial: true } }) }).catch(() => {});
          }
        }).catch(() => {});
      }

      // Tracker event for iOS renewal payment (production only)
      if (rcType === 'RENEWAL' && !isSandbox) {
        pool.query('SELECT email FROM users WHERE id = $1', [userId]).then(({ rows }) => {
          if (rows[0]) {
            fetch('https://selectic.games/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': process.env.TRACKER_TOKEN || '' }, body: JSON.stringify({ projectId: 'lovetta', eventType: 'payment', userEmail: rows[0].email, meta: { plan, amount: plan === 'yearly' ? 99.99 : 19.99, source } }) }).catch(() => {});
          }
        }).catch(() => {});
      }

      // TrafficStars S2S pay postback for initial purchase
      if (rcType === 'INITIAL_PURCHASE') {
        const rcPrice = plan === 'yearly' ? '99.990' : '19.990';
        pool.query('SELECT ts_click_id FROM users WHERE id = $1', [userId])
          .then(({ rows }) => { if (rows[0]?.ts_click_id) firePayPostback(rows[0].ts_click_id, userId, rcPrice); })
          .catch(() => {});
      }
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
      // Tip / consumable purchase via RevenueCat (App Store or Google Play).
      // The tier comes from the product, not the price paid: price_in_purchased_currency is in the
      // buyer's own currency (e.g. 850 rupees), which made a $9.99 tip count as an 85000-cent one.
      const amount = TIP_PRODUCT_CENTS[storeProductId(productId)]
        || (event.price ? Math.round(event.price * 100) : 0)
        || (event.price_in_purchased_currency ? Math.round(event.price_in_purchased_currency * 100) : 0);
      if (amount > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const intent = await findPendingIosTipIntent(client, userId, storeProductId(productId));
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
        console.log(`[revenuecat] Tip: user=${userId} amount=${amount}${isSandbox ? ' [SANDBOX]' : ''}`);
        if (!isSandbox) {
          pool.query('SELECT email FROM users WHERE id = $1', [userId]).then(({ rows }) => {
            if (rows[0]) fetch('https://selectic.games/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': process.env.TRACKER_TOKEN || '' }, body: JSON.stringify({ projectId: 'lovetta', eventType: 'payment', userEmail: rows[0].email, meta: { plan: 'tip', amount: amount / 100, source } }) }).catch(() => {});
          }).catch(() => {});
        }
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
  storeProductId,
  planForProduct,
  createIosTipIntent,
  getIosTipIntent,
  isIosTipThankYouReady,
  handleRevenueCatWebhook,
  syncRevenueCatSubscription,
  getUserSubscription,
  grantSubscription,
  getPaymentProvider,
  isSubscriptionActive,
  insertTipThankYou,
  TIP_AMOUNTS,
};
