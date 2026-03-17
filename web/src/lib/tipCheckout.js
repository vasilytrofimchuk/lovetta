import api from './api';

export const TIP_AMOUNTS = [9.99, 19.99, 49.99, 99.99];

export async function startTipCheckout(amount, companionId) {
  const { data } = await api.post('/api/billing/tip', {
    amount: Math.round(amount * 100),
    companionId,
  });
  window.location.href = data.url;
}
