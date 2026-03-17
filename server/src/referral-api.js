/**
 * Referral API — stats, payout method, cashout requests.
 */

const { Router } = require('express');
const { getPool } = require('./db');
const { authenticate } = require('./auth-middleware');

const router = Router();

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3900').trim();
const VALID_METHODS = ['paypal', 'venmo', 'zelle', 'credit'];
const MIN_CASHOUT_CENTS = 10000; // $100

// -- GET /api/referral/stats ---------------------------------
router.get('/stats', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const userId = req.userId;

    // Get user's referral code + payout preferences
    const { rows: [user] } = await pool.query(
      `SELECT u.referral_code, p.payout_method, p.payout_detail
       FROM users u
       LEFT JOIN user_preferences p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    // Count invited users
    const { rows: [countRow] } = await pool.query(
      'SELECT COUNT(*) AS cnt FROM users WHERE referred_by = $1', [userId]
    );

    // Total earned commissions
    const { rows: [commRow] } = await pool.query(
      'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM referral_commissions WHERE referrer_id = $1', [userId]
    );

    // Total paid out or pending payouts
    const { rows: [payoutRow] } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM referral_payouts WHERE user_id = $1 AND status IN ('pending', 'approved', 'paid')", [userId]
    );

    // Pending cashout
    const { rows: [pendingRow] } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM referral_payouts WHERE user_id = $1 AND status = 'pending'", [userId]
    );

    const referralCode = user?.referral_code || '';
    const balanceCents = parseInt(commRow.total, 10) - parseInt(payoutRow.total, 10);

    res.json({
      referralCode,
      referralLink: referralCode ? `${SITE_URL}/?ref=${referralCode}` : '',
      invitedCount: parseInt(countRow.cnt, 10),
      balanceCents: Math.max(0, balanceCents),
      pendingCashoutCents: parseInt(pendingRow.total, 10),
      payoutMethod: user?.payout_method || null,
      payoutDetail: user?.payout_detail || null,
    });
  } catch (err) {
    console.error('[referral] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load referral stats' });
  }
});

// -- PUT /api/referral/payout-method -------------------------
router.put('/payout-method', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { method, detail } = req.body || {};
    if (!method || !VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Invalid payout method. Must be: paypal, venmo, zelle, or credit' });
    }
    if (method !== 'credit' && (!detail || !detail.trim())) {
      return res.status(400).json({ error: 'Payout detail is required (email, phone, or handle)' });
    }

    await pool.query(
      `INSERT INTO user_preferences (user_id, payout_method, payout_detail, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payout_method = $2, payout_detail = $3, updated_at = NOW()`,
      [req.userId, method, method === 'credit' ? null : detail.trim()]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[referral] payout-method error:', err.message);
    res.status(500).json({ error: 'Failed to save payout method' });
  }
});

// -- POST /api/referral/cashout ------------------------------
router.post('/cashout', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const userId = req.userId;

    // Check no existing pending cashout
    const { rows: pending } = await pool.query(
      "SELECT id FROM referral_payouts WHERE user_id = $1 AND status = 'pending'", [userId]
    );
    if (pending.length > 0) {
      return res.status(400).json({ error: 'You already have a pending cashout request' });
    }

    // Calculate balance
    const { rows: [commRow] } = await pool.query(
      'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM referral_commissions WHERE referrer_id = $1', [userId]
    );
    const { rows: [payoutRow] } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM referral_payouts WHERE user_id = $1 AND status IN ('pending', 'approved', 'paid')", [userId]
    );
    const balanceCents = parseInt(commRow.total, 10) - parseInt(payoutRow.total, 10);

    if (balanceCents < MIN_CASHOUT_CENTS) {
      return res.status(400).json({ error: `Minimum cashout is $${(MIN_CASHOUT_CENTS / 100).toFixed(0)}` });
    }

    // Get payout method from preferences
    const { rows: prefRows } = await pool.query(
      'SELECT payout_method, payout_detail FROM user_preferences WHERE user_id = $1', [userId]
    );
    const method = prefRows[0]?.payout_method;
    if (!method) {
      return res.status(400).json({ error: 'Please set a payout method first' });
    }

    await pool.query(
      'INSERT INTO referral_payouts (user_id, amount, method, method_detail) VALUES ($1, $2, $3, $4)',
      [userId, balanceCents, method, prefRows[0]?.payout_detail || null]
    );

    res.json({ ok: true, amount: balanceCents });
  } catch (err) {
    console.error('[referral] cashout error:', err.message);
    res.status(500).json({ error: 'Failed to create cashout request' });
  }
});

module.exports = router;
