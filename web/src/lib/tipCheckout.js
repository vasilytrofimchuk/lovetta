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
    // Use RevenueCat for native IAP
    const tip = TIP_AMOUNTS.find(t => t.amount === amount);
    if (!tip) throw new Error('Invalid tip amount');
    const { purchaseProduct } = await import('./revenuecat');
    await purchaseProduct(tip.rcProductId);
    return; // Purchase handled natively, webhook syncs to server
  }

  // Stripe checkout for web
  const { data } = await api.post('/api/billing/tip', {
    amount: Math.round(amount * 100),
    companionId,
  });
  window.location.href = data.url;
}
