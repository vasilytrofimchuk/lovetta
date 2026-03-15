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

module.exports = {
  BASE,
  base,
  adminHeaders,
};
