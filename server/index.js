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
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { migrate } = require('./src/migrate');
const trackingApi = require('./src/tracking-api');
const leadsApi = require('./src/leads-api');
const adminApi = require('./src/admin-api');
const authApi = require('./src/auth-api');
const billingApi = require('./src/billing-api');

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

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', trackingApi);
app.use('/api', leadsApi);
app.use('/api/auth', authApi);
app.use('/api/billing', billingApi);
app.use('/api/admin', adminApi);

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
