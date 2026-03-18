/**
 * IP geolocation via ip-api.com — shared module.
 */

async function geoFromIp(ip) {
  if (!ip) return {};
  const clean = ip.replace(/^::ffff:/, '');
  if (clean === '127.0.0.1' || clean === '::1' || clean.startsWith('192.168.') || clean.startsWith('10.')) {
    return {};
  }
  try {
    const r = await fetch(`http://ip-api.com/json/${clean}?fields=country,regionName,city,timezone`);
    if (!r.ok) return {};
    const d = await r.json();
    if (d.status === 'fail') return {};
    return { country: d.country || null, state: d.regionName || null, city: d.city || null, timezone: d.timezone || null };
  } catch {
    return {};
  }
}

module.exports = { geoFromIp };
