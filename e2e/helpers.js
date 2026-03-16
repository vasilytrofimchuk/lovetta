/**
 * Shared test helpers.
 * Port is read from .test-port file (written by global-setup).
 */

const fs = require('fs');
const path = require('path');

const PORT_FILE = path.join(__dirname, '.test-port');

function getBase() {
  try {
    const port = fs.readFileSync(PORT_FILE, 'utf8').trim();
    return `http://localhost:${port}`;
  } catch {
    return 'http://localhost:3900';
  }
}

const BASE = getBase();
function base() { return BASE; }

function adminHeaders() {
  return {
    'Authorization': 'Bearer test-admin-token',
    'Content-Type': 'application/json',
  };
}

async function saveNamedDemoVideo(page, filename) {
  const video = page.video();
  if (!video) return null;

  const videosDir = path.join(__dirname, 'videos');
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

  const extension = path.extname(filename) || '.webm';
  const baseName = path.basename(filename, extension);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let destination = path.join(videosDir, `${baseName}-${stamp}${extension}`);
  let counter = 1;

  while (fs.existsSync(destination)) {
    destination = path.join(videosDir, `${baseName}-${stamp}-${counter}${extension}`);
    counter += 1;
  }

  await page.context().close();
  await video.saveAs(destination);
  return destination;
}

/**
 * Create a test user and return { accessToken, refreshToken, user, userId }.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function createTestUser(request) {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await request.post(`${BASE}/api/auth/signup`, {
    data: {
      email,
      password: 'Test1234!',
      birthMonth: 6,
      birthYear: 1995,
      termsAccepted: true,
      privacyAccepted: true,
    },
  });
  const data = await res.json();
  return {
    ...data,
    userId: data.user?.id,
    email,
    authHeaders: {
      'Authorization': `Bearer ${data.accessToken}`,
      'Content-Type': 'application/json',
    },
  };
}

module.exports = {
  BASE,
  base,
  adminHeaders,
  saveNamedDemoVideo,
  createTestUser,
};
