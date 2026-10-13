process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');
const { RENEWAL_REMINDER_SQL } = require('../server/src/scheduler');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/lovetta_test';

test.describe('Renewal reminder audience', () => {
  let pool;
  const userIds = [];

  // The address must get past the scheduler's own test-address filter
  // (`conativer+%`), and nothing is sent here — the test only runs the SELECT.
  async function subscriber({ verified, disabled = false, hours = 72 }) {
    const email = `conativer.renewal${Date.now()}${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, email_disabled, email_disabled_reason, birth_month, birth_year, terms_accepted, privacy_accepted, ai_consent_at)
       VALUES ($1, 'hash', $2, $3, $4, 1, 1995, true, true, NOW()) RETURNING id`,
      [email, verified, disabled, disabled ? 'invalid_domain' : null]
    );
    userIds.push(u.id);
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, current_period_end)
       VALUES ($1, 'monthly', 'active', NOW() + ($2 || ' hours')::interval)`,
      [u.id, String(hours)]
    );
    return u.id;
  }

  async function audience() {
    const { rows } = await pool.query(RENEWAL_REMINDER_SQL);
    return rows.map((r) => r.id);
  }

  test.beforeAll(() => { pool = new Pool({ connectionString: TEST_DB_URL }); });
  test.afterAll(async () => {
    for (const id of userIds) await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.end();
  });

  test('a paying subscriber gets it whether or not the address is confirmed', async () => {
    const unconfirmed = await subscriber({ verified: false });
    const confirmed = await subscriber({ verified: true });
    const ids = await audience();
    expect(ids).toContain(unconfirmed);
    expect(ids).toContain(confirmed);
  });

  test('a switched-off address (invalid_domain) is still skipped', async () => {
    const dead = await subscriber({ verified: false, disabled: true });
    expect(await audience()).not.toContain(dead);
  });

  test('a subscriber renewing outside the 3-day window is not reminded yet', async () => {
    const later = await subscriber({ verified: true, hours: 200 });
    expect(await audience()).not.toContain(later);
  });

  test('the welcome and come-back emails still need a confirmed address', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server/src/scheduler.js'), 'utf8');
    expect(RENEWAL_REMINDER_SQL).not.toContain('email_verified');
    expect(src.split('u.email_verified = TRUE').length - 1).toBe(4);
  });
});
