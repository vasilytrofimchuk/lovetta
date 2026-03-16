/**
 * Auth API — signup, login, token refresh, password reset, email verification.
 */

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getPool } = require('./db');
const { geoFromIp } = require('./geo');
const {
  generateAccessToken, generateRefreshToken, verifyRefreshToken,
  generateVerifyToken, verifyVerifyToken,
  generateResetToken, verifyResetToken,
  hashToken,
} = require('./jwt');
const { authenticate } = require('./auth-middleware');
const { sendVerificationEmail, sendResetEmail } = require('./email');

const router = Router();

// -- Rate limiters ----------------------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests, try again later' },
});

// -- Helpers ----------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAtLeast18(birthMonth, birthYear) {
  const now = new Date();
  const age = now.getFullYear() - birthYear - (now.getMonth() + 1 < birthMonth ? 1 : 0);
  return age >= 18;
}

function sanitizeUser(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    email_verified: row.email_verified,
    auth_provider: row.auth_provider,
    created_at: row.created_at,
  };
}

async function storeRefreshToken(pool, userId, refreshToken) {
  const hash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt]
  );
}

// -- POST /api/auth/signup --------------------------------
router.post('/signup', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { email, password, birthMonth, birthYear, termsAccepted, privacyAccepted } = req.body || {};

    // Validate
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const month = parseInt(birthMonth, 10);
    const year = parseInt(birthYear, 10);
    if (!month || month < 1 || month > 12 || !year || year < 1900) {
      return res.status(400).json({ error: 'Valid birth month and year are required' });
    }
    if (!isAtLeast18(month, year)) {
      return res.status(403).json({ error: 'You must be 18 or older' });
    }
    if (!termsAccepted || !privacyAccepted) {
      return res.status(400).json({ error: 'You must accept the terms and privacy policy' });
    }

    // Check duplicate
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = generateVerifyToken(email.trim().toLowerCase());
    const ip = req.ip || '';
    const geo = await geoFromIp(ip).catch(() => ({}));

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password_hash, birth_month, birth_year, terms_accepted, privacy_accepted,
                          verify_token, ip_address, country, city, user_agent, auth_provider)
       VALUES (LOWER($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'email')
       RETURNING *`,
      [email.trim(), passwordHash, month, year, true, true,
       verifyToken, ip, geo.country || null, geo.city || null, req.get('User-Agent') || null]
    );

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verifyToken).catch(() => {});

    res.json({ user: sanitizeUser(user), accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] signup error:', err.message);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// -- POST /api/auth/login ---------------------------------
router.post('/login', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Please sign in with Google or another provider' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    // Update activity (non-blocking)
    pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [user.id]).catch(() => {});

    res.json({ user: sanitizeUser(user), accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// -- POST /api/auth/refresh -------------------------------
router.post('/refresh', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const hash = hashToken(refreshToken);

    // Verify token exists in DB
    const { rows } = await pool.query(
      'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()',
      [hash, decoded.userId]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Delete old token
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);

    // Issue new tokens
    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await storeRefreshToken(pool, decoded.userId, newRefreshToken);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[auth] refresh error:', err.message);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// -- POST /api/auth/logout --------------------------------
router.post('/logout', authenticate, async (req, res) => {
  const pool = getPool();
  if (pool) {
    // Delete all refresh tokens for this user
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.userId]).catch(() => {});
  }
  res.json({ ok: true });
});

// -- GET /api/auth/me -------------------------------------
router.get('/me', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error('[auth] me error:', err.message);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// -- GET /api/auth/verify-email ---------------------------
router.get('/verify-email', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const decoded = verifyVerifyToken(token);

    const { rowCount } = await pool.query(
      `UPDATE users SET email_verified = TRUE, verify_token = NULL
       WHERE LOWER(email) = LOWER($1) AND email_verified = FALSE`,
      [decoded.email]
    );

    if (rowCount === 0) {
      return res.status(400).json({ error: 'Already verified or invalid token' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] verify-email error:', err.message);
    res.status(400).json({ error: 'Invalid or expired token' });
  }
});

// -- POST /api/auth/resend-verification -------------------
router.post('/resend-verification', authenticate, resendLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { rows } = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (rows[0].email_verified) return res.json({ ok: true, message: 'Already verified' });

    const verifyToken = generateVerifyToken(rows[0].email);
    await pool.query('UPDATE users SET verify_token = $1 WHERE id = $2', [verifyToken, req.userId]);
    await sendVerificationEmail(rows[0].email, verifyToken);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] resend-verification error:', err.message);
    res.status(500).json({ error: 'Failed to resend' });
  }
});

// -- POST /api/auth/forgot-password -----------------------
router.post('/forgot-password', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Always return success (don't leak whether email exists)
    const { rows } = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (rows.length > 0) {
      const resetToken = generateResetToken(rows[0].email);
      await pool.query(
        'UPDATE users SET reset_token = $1, reset_expires = NOW() + INTERVAL \'1 hour\' WHERE id = $2',
        [resetToken, rows[0].id]
      );
      sendResetEmail(rows[0].email, resetToken).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// -- POST /api/auth/reset-password ------------------------
router.post('/reset-password', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const decoded = verifyResetToken(token);
    const passwordHash = await bcrypt.hash(password, 12);

    const { rowCount } = await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL
       WHERE LOWER(email) = LOWER($2) AND reset_token = $3 AND reset_expires > NOW()`,
      [passwordHash, decoded.email, token]
    );

    if (rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Invalidate all refresh tokens
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [decoded.email]);
    if (rows.length > 0) {
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [rows[0].id]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

// -- POST /api/auth/google --------------------------------
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();

router.post('/google', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google auth not configured' });

  try {
    const { credential, birthMonth, birthYear } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify the ID token with Google
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!tokenInfoRes.ok) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    const tokenInfo = await tokenInfoRes.json();

    // Validate audience
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Invalid token audience' });
    }

    const googleId = tokenInfo.sub;
    const email = tokenInfo.email;
    const name = tokenInfo.name || null;
    const picture = tokenInfo.picture || null;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists by google_id or email
    const { rows: existingByGoogle } = await pool.query(
      'SELECT * FROM users WHERE google_id = $1', [googleId]
    );

    let user;

    if (existingByGoogle.length > 0) {
      // Existing Google user — login
      user = existingByGoogle[0];
      // Update profile pic if changed
      if (picture && picture !== user.avatar_url) {
        pool.query('UPDATE users SET avatar_url = $1, last_activity = NOW() WHERE id = $2', [picture, user.id]).catch(() => {});
      }
    } else {
      // Check if email already exists (link Google to existing account)
      const { rows: existingByEmail } = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]
      );

      if (existingByEmail.length > 0) {
        // Link Google ID to existing email account
        user = existingByEmail[0];
        await pool.query(
          'UPDATE users SET google_id = $1, email_verified = TRUE, avatar_url = COALESCE(avatar_url, $2), display_name = COALESCE(display_name, $3) WHERE id = $4',
          [googleId, picture, name, user.id]
        );
        user.email_verified = true;
        user.avatar_url = user.avatar_url || picture;
        user.display_name = user.display_name || name;
      } else {
        // New user — require age verification
        const month = parseInt(birthMonth, 10);
        const year = parseInt(birthYear, 10);
        if (!month || month < 1 || month > 12 || !year || year < 1900) {
          return res.status(400).json({ error: 'age_required', message: 'Birth month and year are required for new accounts' });
        }
        if (!isAtLeast18(month, year)) {
          return res.status(403).json({ error: 'You must be 18 or older' });
        }

        const ip = req.ip || '';
        const geo = await geoFromIp(ip).catch(() => ({}));

        const { rows: [newUser] } = await pool.query(
          `INSERT INTO users (email, google_id, display_name, avatar_url, email_verified, birth_month, birth_year,
                              terms_accepted, privacy_accepted, ip_address, country, city, user_agent, auth_provider)
           VALUES (LOWER($1), $2, $3, $4, TRUE, $5, $6, TRUE, TRUE, $7, $8, $9, $10, 'google')
           RETURNING *`,
          [email, googleId, name, picture, month, year,
           ip, geo.country || null, geo.city || null, req.get('User-Agent') || null]
        );
        user = newUser;
      }
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    res.json({ user: sanitizeUser(user), accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] google error:', err.message);
    res.status(500).json({ error: 'Google auth failed' });
  }
});

module.exports = router;
