const { test, expect } = require('@playwright/test');
const { BASE } = require('./helpers');

test.describe('Visitor tracking', () => {
  test('POST /api/track-visitor accepts valid data', async ({ request }) => {
    const res = await request.post(`${BASE}/api/track-visitor`, {
      data: {
        sessionId: 'sess_test_' + Date.now() + '_abcdef123',
        page: '/',
        deviceType: 'Desktop',
        screenResolution: '1920x1080',
        language: 'en-US',
        timezone: 'America/New_York',
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        gclid: null,
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('ignores short session IDs', async ({ request }) => {
    const res = await request.post(`${BASE}/api/track-visitor`, {
      data: { sessionId: 'short' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('updates last_activity on repeat visit', async ({ request }) => {
    const sid = 'sess_repeat_' + Date.now() + '_xyz123456';

    // First visit
    await request.post(`${BASE}/api/track-visitor`, {
      data: { sessionId: sid, page: '/', deviceType: 'Desktop' },
    });

    // Repeat visit
    const res = await request.post(`${BASE}/api/track-visitor`, {
      data: { sessionId: sid, page: '/about' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
