export function idsyncEvent(name, type, value) {
  try {
    if (window.idsync?.send_event) {
      window.idsync.send_event({ name, type, value });
    }
  } catch {}
}

export const trackSignup = () => idsyncEvent('signup', 'Acquisition', '0.100');
export const trackPay = () => idsyncEvent('pay', 'Revenue', '10.000');
