if (process.env.NODE_ENV !== 'test') {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
    }
  } catch {}
}

const express = require('express');
const path = require('path');
const { migrate } = require('./src/migrate');
const trackingApi = require('./src/tracking-api');
const leadsApi = require('./src/leads-api');
const adminApi = require('./src/admin-api');

const app = express();
const PORT = process.env.PORT || 3900;
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', trackingApi);
app.use('/api', leadsApi);
app.use('/api/admin', adminApi);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'lovetta' });
});

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
