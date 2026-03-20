/**
 * TrafficStars S2S postback — fires conversion events to TrafficStars.
 */

const TS_KEY = 'NH0bXk2fXzwx09A1NXxxnw1BhF7VVG7EyHCF';
const TS_BASE = 'https://tsyndicate.com/api/v1/cpa/action';

async function firePostback(clickId, { value = '', price = '', leadCode = '', goalId = '0' } = {}) {
  if (!clickId) return;
  const url = `${TS_BASE}?clickid=${encodeURIComponent(clickId)}&key=${TS_KEY}&goalid=${goalId}&value=${encodeURIComponent(value)}&price=${encodeURIComponent(price)}&lead_code=${encodeURIComponent(leadCode)}`;
  try {
    const res = await fetch(url);
    console.log(`[trafficstars] postback ${res.status}: clickid=${clickId} value=${value}`);
  } catch (err) {
    console.warn(`[trafficstars] postback error: ${err.message}`);
  }
}

function fireSignupPostback(clickId, userId) {
  firePostback(clickId, { value: '0.100', leadCode: String(userId) });
}

function firePayPostback(clickId, userId, price) {
  firePostback(clickId, { value: price || '10.000', price: price || '10.000', leadCode: String(userId) });
}

module.exports = { firePostback, fireSignupPostback, firePayPostback };
