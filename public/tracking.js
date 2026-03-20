/**
 * Lovetta visitor tracking — lightweight IIFE for public pages.
 * Collects device info and sends to /api/track-visitor.
 */
(function() {
  'use strict';

  var ENDPOINT = '/api/track-visitor';
  var SESSION_KEY = 'lovetta-session-id';

  function getSessionId() {
    var id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function getDeviceType() {
    var ua = navigator.userAgent || '';
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'Tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function getUtmParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      return {
        utmSource: p.get('utm_source') || null,
        utmMedium: p.get('utm_medium') || null,
        utmCampaign: p.get('utm_campaign') || null,
        utmContent: p.get('utm_content') || null,
        gclid: p.get('gclid') || null
      };
    } catch (e) {
      return {};
    }
  }

  var utm = getUtmParams();

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: getSessionId(),
      page: window.location.pathname,
      deviceType: getDeviceType(),
      screenResolution: screen.width + 'x' + screen.height,
      language: navigator.language || null,
      timezone: (function() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) { return null; } })(),
      referrer: document.referrer || null,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign,
      utmContent: utm.utmContent,
      gclid: utm.gclid
    })
  }).then(function(r) {
    return r.json();
  }).then(function(data) {
    if (data && data.country) {
      try { sessionStorage.setItem('lovetta-geo', JSON.stringify(data)); } catch(e) {}
    }
  }).catch(function() {});

  window.LovettaTracking = {
    getSessionId: getSessionId,
    getDeviceType: getDeviceType
  };
})();
