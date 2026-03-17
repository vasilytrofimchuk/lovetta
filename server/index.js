if (process.env.NODE_ENV !== 'test') {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
    }
  } catch {}
}

// Sentry must initialize before other imports
const Sentry = require('@sentry/node');
const SENTRY_ENABLED = Boolean(process.env.SENTRY_DSN)
  && (process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLE_NON_PROD === 'true');
if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  console.log('[lovetta] Sentry initialized');
}

const express = require('express');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { migrate } = require('./src/migrate');
const trackingApi = require('./src/tracking-api');
const leadsApi = require('./src/leads-api');
const adminApi = require('./src/admin-api');
const authApi = require('./src/auth-api');
const billingApi = require('./src/billing-api');
const companionApi = require('./src/companion-api');
const chatApi = require('./src/chat-api');
const ttsApi = require('./src/tts-api');
const userApi = require('./src/user-api');

const app = express();
const PORT = process.env.PORT || 3900;
app.set('trust proxy', 1);

// Stripe webhook MUST come before express.json() — raw body needed for signature
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const { handleWebhook } = require('./src/billing');
      const sig = req.headers['stripe-signature'];
      const result = await handleWebhook(req.body, sig);
      res.json({ received: true, ...result });
    } catch (err) {
      console.error('[stripe-webhook]', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// Telegram webhook (also needs raw/json body but after stripe raw handler)
app.post('/api/webhooks/telegram', express.json(), async (req, res) => {
  try {
    const { handleBotUpdate, verifyWebhookSecret } = require('./src/telegram');
    if (!verifyWebhookSecret(req)) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    await handleBotUpdate(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[telegram-webhook]', err.message);
    res.status(200).json({ ok: true }); // Always 200 to prevent Telegram retries
  }
});

// STT needs raw body — mount before express.json()
app.post('/api/chat/stt',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }),
  async (req, res) => {
    try {
      const { authenticate } = require('./src/auth-middleware');
      await new Promise((resolve, reject) => authenticate(req, res, (err) => err ? reject(err) : resolve()));
      if (!req.body || req.body.length < 1000) {
        return res.status(400).json({ error: 'Recording too short' });
      }
      const { transcribeSpeech } = require('./src/ai');
      const ct = req.headers['content-type'] || 'audio/webm';
      const ext = ct.includes('wav') ? 'wav' : ct.includes('mp4') ? 'mp4' : 'webm';
      const { text } = await transcribeSpeech(req.body, `voice.${ext}`);
      res.json({ text });
    } catch (err) {
      console.error('[stt] error:', err.message);
      if (!res.headersSent) res.status(400).json({ error: 'Could not transcribe audio' });
    }
  }
);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', trackingApi);
app.use('/api', leadsApi);
app.use('/api/auth', authApi);
app.use('/api/billing', billingApi);
app.use('/api/admin', adminApi);
app.use('/api/companions', companionApi);
app.use('/api/chat', chatApi);
app.use('/api/chat', ttsApi);
app.use('/api/user', userApi);

// -- Resend inbound webhook --
const RESEND_INBOUND_SECRET = (process.env.RESEND_INBOUND_SECRET || '').trim();

app.post('/api/inbound', async (req, res) => {
  if (RESEND_INBOUND_SECRET) {
    const signature = req.get('svix-signature') || '';
    const timestamp = req.get('svix-timestamp') || '';
    const msgId = req.get('svix-id') || '';

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const timestampSec = parseInt(timestamp, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
      return res.status(401).json({ error: 'Webhook timestamp too old or invalid' });
    }

    const payload = JSON.stringify(req.body);
    const toSign = `${msgId}.${timestamp}.${payload}`;
    const expected = crypto
      .createHmac('sha256', Buffer.from(RESEND_INBOUND_SECRET.replace('whsec_', ''), 'base64'))
      .update(toSign)
      .digest('base64');

    const sigParts = signature.split(' ');
    const valid = sigParts.some(s => s.replace(/^v1,/, '') === expected);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  try {
    const body = req.body || {};
    const eventType = body.type;
    const payload = body.data || body;

    console.log(`[inbound] Webhook received: type=${eventType}, email_id=${payload.email_id || 'none'}`);

    if (eventType && eventType !== 'email.received') {
      return res.json({ ok: true });
    }

    let { from, to, cc, subject, text, html, headers } = payload;

    // Resend webhooks may not include body — fetch via API
    if (payload.email_id && (!text && !html)) {
      const RESEND_KEY = (process.env.RESEND_API_KEY || '').trim();
      if (RESEND_KEY) {
        try {
          const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${payload.email_id}`, {
            headers: { Authorization: `Bearer ${RESEND_KEY}` },
          });
          if (fetchRes.ok) {
            const emailContent = await fetchRes.json();
            text = emailContent.text || text;
            html = emailContent.html || html;
            headers = emailContent.headers || headers;
            if (!from) from = emailContent.from;
            if (!to) to = emailContent.to;
            if (!subject) subject = emailContent.subject;
            console.log(`[inbound] Fetched content for ${payload.email_id}: subject="${subject}"`);
          }
        } catch (fetchErr) {
          console.warn(`[inbound] Error fetching email content: ${fetchErr.message}`);
        }
      }
    }

    // Route to admin inbox or companion reply
    const { ADMIN_EMAILS, COMPANION_EMAIL_DOMAIN, processAdminInbound, processCompanionReply } = require('./src/email');
    const recipientAddr = (Array.isArray(to) ? to[0] : to) || '';
    const recipientStr = typeof recipientAddr === 'object' ? (recipientAddr.address || recipientAddr.email || String(recipientAddr)) : String(recipientAddr);

    if (ADMIN_EMAILS.includes(recipientStr.toLowerCase())) {
      await processAdminInbound({ from, to: recipientStr, cc, subject, text, html, headers });
    } else if (recipientStr.toLowerCase().endsWith(`@${COMPANION_EMAIL_DOMAIN}`)) {
      // Reply to a companion email — route to chat
      await processCompanionReply({ from, to: recipientStr, cc, subject, text, html, headers });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[inbound] error:', err.message);
    res.json({ ok: true });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'lovetta' });
});

// SPA fallback for /my/* — serve React app
const spaIndex = path.join(__dirname, '..', 'public', 'my', 'index.html');
app.get('/my/*', (req, res) => {
  if (fs.existsSync(spaIndex)) {
    res.sendFile(spaIndex);
  } else {
    res.status(404).send('App not built yet. Run: npm run build');
  }
});

// Sentry error handler (must be after all routes)
if (SENTRY_ENABLED) {
  Sentry.setupExpressErrorHandler(app);
}

// Start
async function start() {
  await migrate();

  app.listen(PORT, () => {
    console.log(`[lovetta] Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[lovetta] Failed to start:', err);
  process.exit(1);
});

module.exports = app;
