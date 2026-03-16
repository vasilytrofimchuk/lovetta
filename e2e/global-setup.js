/**
 * Global setup — start server on a random free port with test DB, run migrations.
 */

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT_FILE = path.join(__dirname, '.test-port');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(500, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Server did not start');
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'pipe', cwd: process.cwd() });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

module.exports = async function globalSetup() {
  // Build React app so UI tests work against server on random port
  console.log('[setup] Building React app...');
  await runCommand('npm', ['-w', 'web', 'run', 'build']);

  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test';
  const port = await getFreePort();

  fs.writeFileSync(PORT_FILE, String(port));

  // Load .env to get API keys for real API tests
  try { process.loadEnvFile('.env'); } catch {}

  const server = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
      PORT: String(port),
      NODE_ENV: 'test',
      ADMIN_TOKEN: 'test-admin-token',
      JWT_SECRET: 'test-jwt-secret-000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-000',
    },
    stdio: 'pipe',
    cwd: process.cwd(),
  });

  server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

  globalThis.__SERVER_PROCESS__ = server;

  await waitForServer(`http://localhost:${port}/api/health`);
  console.log('[setup] Server ready on port', port);
};
