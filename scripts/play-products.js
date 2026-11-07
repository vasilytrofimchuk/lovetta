#!/usr/bin/env node
// Create (or show) the Google Play products that mirror the App Store ones. Idempotent: existing products
// are left as they are. Login and helpers: scripts/play-release.js (owner's OAuth, never printed).
//   node scripts/play-products.js --show
//   node scripts/play-products.js            create what is missing
//   node scripts/play-products.js --package ai.negotiate.app --config <file.json>
const fs = require('fs');
const path = require('path');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = n => process.argv.includes(`--${n}`);
const die = (...a) => { console.error(...a); process.exit(1); };

const PKG = arg('package') || 'ai.lovetta.app';
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

// Lovetta defaults — same ids and US prices as the App Store. No free trial (hard paywall, 2026-10).
const DEFAULT = {
  subscriptions: [
    { id: 'lovetta_monthly', basePlan: 'monthly', period: 'P1M', usd: '19.99',
      title: 'Lovetta Premium (monthly)', benefits: ['Unlimited chats with her', 'Voice messages', 'Photos from her'] },
    { id: 'lovetta_yearly', basePlan: 'yearly', period: 'P1Y', usd: '99.99',
      title: 'Lovetta Premium (yearly)', benefits: ['Unlimited chats with her', 'Voice messages', 'Photos from her'] },
  ],
  oneTime: [
    { id: 'lovetta_tip_999', usd: '9.99', title: 'Small gift', description: 'A small gift for your girlfriend.' },
    { id: 'lovetta_tip_1999', usd: '19.99', title: 'Gift', description: 'A gift for your girlfriend.' },
    { id: 'lovetta_tip_4999', usd: '49.99', title: 'Big gift', description: 'A big gift for your girlfriend.' },
    { id: 'lovetta_tip_9999', usd: '99.99', title: 'Grand gift', description: 'A grand gift for your girlfriend.' },
  ],
};
const CFG = arg('config') ? JSON.parse(fs.readFileSync(arg('config'), 'utf8')) : DEFAULT;

function credentials() {
  const out = {};
  for (const f of ['/Users/vasily/projects/vseti/.env', path.join(__dirname, '..', 'secrets/play.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = /^(GOOGLE_PLAY_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}
let auth;
async function login() {
  const c = credentials();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: c.GOOGLE_PLAY_CLIENT_ID, client_secret: c.GOOGLE_PLAY_CLIENT_SECRET,
    refresh_token: c.GOOGLE_PLAY_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!t.access_token) die('Play login refused:', t.error);
  auth = 'Bearer ' + t.access_token;
}
async function api(method, url, body) {
  const r = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: auth, 'Content-Type': 'application/json' } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, text, json };
}
const money = usd => { const [u, f = '0'] = usd.split('.'); return { currencyCode: 'USD', units: u, nanos: Number((f + '000000000').slice(0, 9)) }; };

async function regionalPrices(usd) {
  const r = await api('POST', `${BASE}/pricing:convertRegionPrices`, { price: money(usd) });
  if (!r.ok) die('convertRegionPrices failed', r.status, r.text.slice(0, 400));
  return r.json;
}

async function ensureSubscription(s) {
  const got = await api('GET', `${BASE}/subscriptions/${s.id}`);
  if (got.ok) { console.log(`subscription ${s.id}: exists (${(got.json.basePlans || []).map(b => `${b.basePlanId}:${b.state}`).join(', ')})`); return got.json; }
  if (has('show')) { console.log(`subscription ${s.id}: missing`); return null; }
  const conv = await regionalPrices(s.usd);
  const regionalConfigs = Object.values(conv.convertedRegionPrices || {}).map(p => ({ regionCode: p.regionCode, newSubscriberAvailability: true, price: p.price }));
  const body = {
    packageName: PKG, productId: s.id,
    listings: [{ languageCode: 'en-US', title: s.title, benefits: s.benefits }],
    basePlans: [{
      basePlanId: s.basePlan,
      autoRenewingBasePlanType: { billingPeriodDuration: s.period, legacyCompatible: true,
        resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE', prorationMode: 'SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE' },
      regionalConfigs,
      otherRegionsConfig: { usdPrice: money(s.usd), eurPrice: conv.convertedOtherRegionsPrice?.eurPrice || { currencyCode: 'EUR', units: s.usd.split('.')[0], nanos: 990000000 }, newSubscriberAvailability: true },
    }],
  };
  const RV = conv.regionVersion?.version || '2022/02';
  const c = await api('POST', `${BASE}/subscriptions?productId=${s.id}&regionsVersion.version=${RV}`, body);
  if (!c.ok) die(`create ${s.id} failed`, c.status, c.text.slice(0, 800));
  const a = await api('POST', `${BASE}/subscriptions/${s.id}/basePlans/${s.basePlan}:activate`, {});
  console.log(`subscription ${s.id}: created, base plan ${s.basePlan} ${a.ok ? 'active' : 'NOT activated: ' + a.text.slice(0, 200)}`);
  if (s.trial) {
    const offer = {
      packageName: PKG, productId: s.id, basePlanId: s.basePlan, offerId: 'free-trial',
      phases: [{ recurrenceCount: 1, duration: s.trial, regionalConfigs: regionalConfigs.map(r => ({ regionCode: r.regionCode, free: {} })), otherRegionsConfig: { free: {} } }],
      targeting: { acquisitionRule: { scope: { thisSubscription: {} } } },
      regionalConfigs: regionalConfigs.map(r => ({ regionCode: r.regionCode, newSubscriberAvailability: true })),
      otherRegionsConfig: { otherRegionsNewSubscriberAvailability: true },
    };
    const o = await api('POST', `${BASE}/subscriptions/${s.id}/basePlans/${s.basePlan}/offers?offerId=free-trial&regionsVersion.version=${RV}`, offer);
    if (!o.ok) console.log(`  trial offer NOT created: ${o.status} ${o.text.slice(0, 400)}`);
    else {
      const oa = await api('POST', `${BASE}/subscriptions/${s.id}/basePlans/${s.basePlan}/offers/free-trial:activate`, {});
      console.log(`  trial offer free-trial ${s.trial}: ${oa.ok ? 'active' : 'created, NOT activated: ' + oa.text.slice(0, 200)}`);
    }
  }
}

// One-time products use the new oneTimeProducts API (the legacy inappproducts one answers
// "Please migrate to the new publishing API").
async function ensureOneTime(p) {
  const got = await api('GET', `${BASE}/oneTimeProducts/${p.id}`);
  if (got.ok) {
    const opts = got.json.purchaseOptions || [];
    console.log(`one-time ${p.id}: exists (${opts.map(o => `${o.purchaseOptionId}:${o.state}`).join(', ')})`);
    for (const o of opts.filter(o => o.state !== 'ACTIVE')) {
      if (has('show')) continue;
      const a = await api('POST', `${BASE}/oneTimeProducts/${p.id}/purchaseOptions:batchUpdateStates`, {
        requests: [{ activatePurchaseOptionRequest: { packageName: PKG, productId: p.id, purchaseOptionId: o.purchaseOptionId } }] });
      console.log(`  ${o.purchaseOptionId}: ${a.ok ? 'activated' : 'NOT activated ' + a.status + ' ' + a.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    return;
  }
  if (has('show')) { console.log(`one-time ${p.id}: missing`); return; }
  const conv = await regionalPrices(p.usd);
  const body = {
    packageName: PKG, productId: p.id,
    listings: [{ languageCode: 'en-US', title: p.title, description: p.description }],
    purchaseOptions: [{
      purchaseOptionId: 'buy',
      buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: Object.values(conv.convertedRegionPrices || {})
        .map(r => ({ regionCode: r.regionCode, price: r.price, availability: 'AVAILABLE' })),
    }],
  };
  const RV = conv.regionVersion?.version || '2022/02';
  const c = await api('PATCH', `${BASE}/onetimeproducts/${p.id}?allowMissing=true&updateMask=listings,purchaseOptions&regionsVersion.version=${RV}`, body);
  if (!c.ok) { console.log(`one-time ${p.id}: FAILED ${c.status} ${c.text.replace(/\s+/g, " ").slice(0, 700)}`); return; }
  const a = await api('POST', `${BASE}/oneTimeProducts/${p.id}/purchaseOptions:batchUpdateStates`, {
    requests: [{ activatePurchaseOptionRequest: { packageName: PKG, productId: p.id, purchaseOptionId: 'buy' } }] });
  console.log(`one-time ${p.id}: created, ${a.ok ? 'active' : 'NOT activated: ' + a.text.slice(0, 300)}`);
}

(async () => {
  await login();
  for (const s of CFG.subscriptions || []) await ensureSubscription(s);
  for (const p of CFG.oneTime || []) await ensureOneTime(p);
})().catch(e => die(e.stack || e.message));
