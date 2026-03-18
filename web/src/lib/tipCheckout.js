import api from './api';
import { isAppStore } from './platform';

export const TIP_AMOUNTS = [
  { amount: 9.99,  rcProductId: 'lovetta_tip_999' },
  { amount: 19.99, rcProductId: 'lovetta_tip_1999' },
  { amount: 49.99, rcProductId: 'lovetta_tip_4999' },
  { amount: 99.99, rcProductId: 'lovetta_tip_9999' },
];

export async function startTipCheckout(amount, companionId) {
  if (isAppStore()) {
    const tip = TIP_AMOUNTS.find(t => t.amount === amount);
    if (!tip) throw new Error('Invalid tip amount');
    const amountCents = Math.round(amount * 100);
    const { data } = await api.post('/api/billing/ios/tip-intents', {
      productId: tip.rcProductId,
      amount: amountCents,
      companionId,
    });
    const { purchaseProduct, waitForIosTipIntent } = await import('./revenuecat');
    await purchaseProduct(tip.rcProductId);
    const synced = await waitForIosTipIntent(data.intentId);
    return { status: 'completed', intentId: data.intentId, tipId: synced.tipId || null };
  }

  // Stripe checkout for web
  const { data } = await api.post('/api/billing/tip', {
    amount: Math.round(amount * 100),
    companionId,
  });
  window.location.href = data.url;
  return { status: 'redirected' };
}
