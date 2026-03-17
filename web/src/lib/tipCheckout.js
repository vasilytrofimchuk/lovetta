import api from './api';

export const TIP_AMOUNTS = [
  { amount: 9.99,  label: 'A little treat' },
  { amount: 19.99, label: 'Sweet surprise' },
  { amount: 49.99, label: 'Spoil me' },
  { amount: 99.99, label: 'All yours' },
];

export async function startTipCheckout(amount, companionId) {
  const { data } = await api.post('/api/billing/tip', {
    amount: Math.round(amount * 100),
    companionId,
  });
  window.location.href = data.url;
}
