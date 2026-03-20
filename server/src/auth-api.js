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
const { sendVerificationEmail, sendResetEmail, sendNewRegistrationNotification, sendAppleReviewerLoginAlert } = require('./email');
const { fireSignupPostback } = require('./trafficstars');

const APPLE_REVIEWER_ID = '00000000-0000-0000-0000-000000001234';

const crypto = require('crypto');

const router = Router();

// -- Rate limiters (disabled in test mode) -----------------
const isTest = process.env.NODE_ENV === 'test';
const authLimiter = isTest ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

const resendLimiter = isTest ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests, try again later' },
});

// -- Helpers ----------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classifyEmail(email) {
  if (!email) return 'synthetic';
  if (email.endsWith('@privaterelay.appleid.com')) return 'relay';
  if (email.endsWith('@apple.lovetta.ai') || email.endsWith('@telegram.lovetta.ai')) return 'synthetic';
  return 'real';
}

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function resolveReferrer(pool, referralCode) {
  if (!referralCode || typeof referralCode !== 'string') return null;
  const code = referralCode.trim().toUpperCase();
  if (!code) return null;
  const { rows } = await pool.query('SELECT id FROM users WHERE referral_code = $1', [code]);
  return rows[0]?.id || null;
}

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
    email_type: row.email_type,
    real_email: row.real_email,
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
    const { email, password, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode, tsClickId } = req.body || {};

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
    if (!aiConsentAccepted) {
      return res.status(400).json({ error: 'You must consent to AI data processing' });
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
    const refCode = generateReferralCode();
    const referredBy = await resolveReferrer(pool, referralCode);

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password_hash, birth_month, birth_year, terms_accepted, privacy_accepted,
                          ai_consent_at, verify_token, ip_address, country, city, timezone, user_agent, auth_provider,
                          referral_code, referred_by, ts_click_id)
       VALUES (LOWER($1), $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12, 'email', $13, $14, $15)
       RETURNING *`,
      [email.trim(), passwordHash, month, year, true, true,
       verifyToken, ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
       refCode, referredBy, tsClickId || null]
    );

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verifyToken).catch(() => {});
    sendNewRegistrationNotification(user).catch(() => {});

    // TrafficStars S2S signup postback (non-blocking)
    if (tsClickId) fireSignupPostback(tsClickId, user.id);

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

    if (!user.ai_consent_at) {
      return res.status(400).json({ error: 'age_consent_required' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    // Update activity (non-blocking)
    pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [user.id]).catch(() => {});

    if (user.id === APPLE_REVIEWER_ID) {
      sendAppleReviewerLoginAlert(user).catch(() => {});
    }

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

    // Check user not deleted
    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [decoded.userId]
    );
    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Account deleted' });
    }

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
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.userId]);
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

// -- Google OAuth (server-side redirect flow) -------------
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3900').trim();

// GET /api/auth/google — redirect to Google consent screen
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google auth not configured');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${SITE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  // Forward state param (contains age/consent data from landing page)
  const state = req.query.state;
  if (state) params.set('state', state);

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — handle Google redirect
router.get('/google/callback', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.redirect('/my/login?error=service_unavailable');

  try {
    const { code, error: oauthError, state: oauthState } = req.query;
    if (oauthError || !code) {
      return res.redirect('/my/login?error=google_denied');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${SITE_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('[auth] Google token exchange failed:', await tokenRes.text());
      return res.redirect('/my/login?error=google_failed');
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      return res.redirect('/my/login?error=google_failed');
    }

    const googleUser = await userInfoRes.json();
    const googleId = googleUser.id;
    const email = googleUser.email;
    const name = googleUser.name || null;
    const picture = googleUser.picture || null;

    if (!email) {
      return res.redirect('/my/login?error=no_email');
    }

    // Find or create user
    let user;
    const { rows: existingByGoogle } = await pool.query(
      'SELECT * FROM users WHERE google_id = $1', [googleId]
    );

    if (existingByGoogle.length > 0) {
      user = existingByGoogle[0];
      if (!user.ai_consent_at) {
        return res.redirect(`/my/signup?provider=google&email=${encodeURIComponent(email)}`);
      }
      if (picture && picture !== user.avatar_url) {
        pool.query('UPDATE users SET avatar_url = $1, last_activity = NOW() WHERE id = $2', [picture, user.id]).catch(() => {});
      }
    } else {
      const { rows: existingByEmail } = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]
      );

      if (existingByEmail.length > 0) {
        user = existingByEmail[0];
        if (!user.ai_consent_at) {
          return res.redirect(`/my/signup?provider=google&email=${encodeURIComponent(email)}`);
        }
        await pool.query(
          'UPDATE users SET google_id = $1, email_verified = TRUE, avatar_url = COALESCE(avatar_url, $2), display_name = COALESCE(display_name, $3) WHERE id = $4',
          [googleId, picture, name, user.id]
        );
      } else {
        // New Google user — try to use age/consent data from state param
        let birthMonth = null, birthYear = null, hasConsent = false;
        let stateRefCode = null;
        let stateTsClickId = null;

        if (oauthState) {
          try {
            const stateData = JSON.parse(Buffer.from(oauthState, 'base64').toString());
            if (stateData.birthMonth && stateData.birthYear) {
              birthMonth = parseInt(stateData.birthMonth, 10);
              birthYear = parseInt(stateData.birthYear, 10);
              if (!isAtLeast18(birthMonth, birthYear)) {
                return res.redirect('/my/login?error=age_restricted');
              }
              hasConsent = !!(stateData.termsAccepted && stateData.privacyAccepted && stateData.aiConsentAccepted);
            }
            if (stateData.referralCode) stateRefCode = stateData.referralCode;
            if (stateData.tsClickId) stateTsClickId = stateData.tsClickId;
          } catch {}
        }

        if (!birthMonth || !birthYear || !hasConsent) {
          // Redirect to signup to collect age/consent first
          return res.redirect(`/my/signup?provider=google&email=${encodeURIComponent(email)}`);
        }

        const ip = req.ip || '';
        const geo = await geoFromIp(ip).catch(() => ({}));
        const refCode = generateReferralCode();
        const referredBy = await resolveReferrer(pool, stateRefCode);

        const { rows: [newUser] } = await pool.query(
          `INSERT INTO users (email, google_id, display_name, avatar_url, email_verified, birth_month, birth_year,
                              terms_accepted, privacy_accepted, ai_consent_at, ip_address, country, city, timezone, user_agent, auth_provider,
                              referral_code, referred_by, ts_click_id)
           VALUES (LOWER($1), $2, $3, $4, TRUE, $5, $6, TRUE, TRUE, NOW(), $7, $8, $9, $10, $11, 'google', $12, $13, $14)
           RETURNING *`,
          [email, googleId, name, picture, birthMonth, birthYear,
           ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
           refCode, referredBy, stateTsClickId || null]
        );
        user = newUser;
        sendNewRegistrationNotification(newUser).catch(() => {});
        if (stateTsClickId) fireSignupPostback(stateTsClickId, newUser.id);
      }
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    // Redirect back to app with tokens in URL params
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      oauth: 'success',
    });
    if (oauthState) {
      try {
        const stateData = JSON.parse(Buffer.from(oauthState, 'base64').toString());
        if (typeof stateData.postAuthPath === 'string' && stateData.postAuthPath.startsWith('/')) {
          params.set('next', stateData.postAuthPath);
        }
      } catch {}
    }
    res.redirect(`/my/login?${params}`);
  } catch (err) {
    console.error('[auth] google callback error:', err.message);
    res.redirect('/my/login?error=google_failed');
  }
});

// POST /api/auth/google/token — native Capacitor Google Sign-In (ID token flow)
router.post('/google/token', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { idToken, birthMonth, birthYear, termsAccepted, privacyAccepted, aiConsentAccepted, referralCode, tsClickId } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

    // Verify token with Google
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!tokenInfoRes.ok) return res.status(401).json({ error: 'Invalid Google token' });

    const tokenInfo = await tokenInfoRes.json();
    if (tokenInfo.error) return res.status(401).json({ error: 'Invalid Google token' });

    const googleId = tokenInfo.sub;
    const email = tokenInfo.email;
    const name = tokenInfo.name || null;
    const picture = tokenInfo.picture || null;

    if (!email) return res.status(400).json({ error: 'No email from Google' });

    let user;
    const { rows: existingByGoogle } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (existingByGoogle.length > 0) {
      user = existingByGoogle[0];
      if (!user.ai_consent_at) {
        return res.status(400).json({ error: 'age_consent_required' });
      }
      if (picture && picture !== user.avatar_url) {
        pool.query('UPDATE users SET avatar_url = $1, last_activity = NOW() WHERE id = $2', [picture, user.id]).catch(() => {});
      }
    } else {
      const { rows: existingByEmail } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

      if (existingByEmail.length > 0) {
        user = existingByEmail[0];
        if (!user.ai_consent_at) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        await pool.query(
          'UPDATE users SET google_id = $1, email_verified = TRUE, avatar_url = COALESCE(avatar_url, $2), display_name = COALESCE(display_name, $3) WHERE id = $4',
          [googleId, picture, name, user.id]
        );
      } else {
        // New user — require age + consent
        const bMonth = parseInt(birthMonth, 10);
        const bYear = parseInt(birthYear, 10);
        if (!bMonth || !bYear || !termsAccepted || !privacyAccepted || !aiConsentAccepted) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        if (!isAtLeast18(bMonth, bYear)) return res.status(400).json({ error: 'Must be 18 or older' });

        const ip = req.ip || '';
        const geo = await geoFromIp(ip).catch(() => ({}));
        const refCode = generateReferralCode();
        const referredBy = await resolveReferrer(pool, referralCode);

        const { rows: [newUser] } = await pool.query(
          `INSERT INTO users (email, google_id, display_name, avatar_url, email_verified, birth_month, birth_year,
                              terms_accepted, privacy_accepted, ai_consent_at, ip_address, country, city, timezone, user_agent, auth_provider,
                              referral_code, referred_by, ts_click_id)
           VALUES (LOWER($1), $2, $3, $4, TRUE, $5, $6, TRUE, TRUE, NOW(), $7, $8, $9, $10, $11, 'google', $12, $13, $14)
           RETURNING *`,
          [email, googleId, name, picture, bMonth, bYear,
           ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
           refCode, referredBy, tsClickId || null]
        );
        user = newUser;
        sendNewRegistrationNotification(newUser).catch(() => {});
        if (tsClickId) fireSignupPostback(tsClickId, newUser.id);
      }
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] google token error:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// -- Apple Sign In (native Capacitor flow) ----------------

const APPLE_CLIENT_ID = (process.env.APPLE_CLIENT_ID || '').trim();

// Cache Apple public keys for JWT verification
let appleKeysCache = null;
let appleKeysCacheTime = 0;
const APPLE_KEYS_TTL = 60 * 60 * 1000; // 1 hour

async function getApplePublicKeys() {
  if (appleKeysCache && Date.now() - appleKeysCacheTime < APPLE_KEYS_TTL) {
    return appleKeysCache;
  }
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error('Failed to fetch Apple public keys');
  const data = await res.json();
  appleKeysCache = data.keys;
  appleKeysCacheTime = Date.now();
  return appleKeysCache;
}

function pemFromJwk(jwk) {
  const keyObject = require('crypto').createPublicKey({ key: jwk, format: 'jwk' });
  return keyObject.export({ type: 'spki', format: 'pem' });
}

async function verifyAppleToken(identityToken) {
  const jwt = require('jsonwebtoken');
  // Decode header to find the key id
  const header = JSON.parse(Buffer.from(identityToken.split('.')[0], 'base64url').toString());
  const keys = await getApplePublicKeys();
  const matchingKey = keys.find(k => k.kid === header.kid);
  if (!matchingKey) throw new Error('No matching Apple key found');

  const pem = pemFromJwk(matchingKey);
  const decoded = jwt.verify(identityToken, pem, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    // Native iOS tokens use bundle ID as audience; web uses Service ID
    audience: [APPLE_CLIENT_ID, 'ai.lovetta.app'].filter(Boolean),
  });
  return decoded; // { sub, email, email_verified, ... }
}

// POST /api/auth/apple — validate Apple identity token, return tokens
router.post('/apple', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { identityToken, fullName, email: clientEmail,
            birthMonth: bm, birthYear: by,
            termsAccepted, privacyAccepted, aiConsentAccepted, referralCode, tsClickId } = req.body || {};

    if (!identityToken) {
      return res.status(400).json({ error: 'Identity token is required' });
    }

    const applePayload = await verifyAppleToken(identityToken);
    const appleId = applePayload.sub;
    // Apple only sends email on first sign-in; fallback to client-provided email
    const email = applePayload.email || clientEmail;

    if (!appleId) {
      return res.status(400).json({ error: 'Invalid Apple token' });
    }

    // Find existing user by apple_id
    const { rows: existingByApple } = await pool.query(
      'SELECT * FROM users WHERE apple_id = $1', [appleId]
    );

    let user;

    if (existingByApple.length > 0) {
      user = existingByApple[0];
      if (!user.ai_consent_at) {
        return res.status(400).json({ error: 'age_consent_required' });
      }
    } else if (email) {
      // Check by email
      const { rows: existingByEmail } = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]
      );

      if (existingByEmail.length > 0) {
        user = existingByEmail[0];
        if (!user.ai_consent_at) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        // Link Apple ID to existing account
        const displayName = fullName
          ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
          : null;
        await pool.query(
          'UPDATE users SET apple_id = $1, email_verified = TRUE, display_name = COALESCE(display_name, $2), email_type = COALESCE(email_type, $4) WHERE id = $3',
          [appleId, displayName, user.id, classifyEmail(email)]
        );
      } else {
        // New user — require age/consent
        const month = parseInt(bm, 10);
        const year = parseInt(by, 10);
        if (!month || !year || !termsAccepted || !privacyAccepted || !aiConsentAccepted) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        if (!isAtLeast18(month, year)) {
          return res.status(403).json({ error: 'age_restricted' });
        }

        const displayName = fullName
          ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
          : null;
        const ip = req.ip || '';
        const geo = await geoFromIp(ip).catch(() => ({}));
        const refCode = generateReferralCode();
        const referredBy = await resolveReferrer(pool, referralCode);

        const { rows: [newUser] } = await pool.query(
          `INSERT INTO users (email, apple_id, display_name, email_verified, birth_month, birth_year,
                              terms_accepted, privacy_accepted, ai_consent_at, ip_address, country, city, timezone, user_agent, auth_provider,
                              referral_code, referred_by, email_type, ts_click_id)
           VALUES (LOWER($1), $2, $3, TRUE, $4, $5, TRUE, TRUE, NOW(), $6, $7, $8, $9, $10, 'apple', $11, $12, $13, $14)
           RETURNING *`,
          [email, appleId, displayName, month, year,
           ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
           refCode, referredBy, classifyEmail(email), tsClickId || null]
        );
        user = newUser;
        sendNewRegistrationNotification(newUser).catch(() => {});
        if (tsClickId) fireSignupPostback(tsClickId, newUser.id);
      }
    } else {
      // No email available (user hid it from Apple) and no existing apple_id — need age/consent
      const month = parseInt(bm, 10);
      const year = parseInt(by, 10);
      if (!month || !year || !termsAccepted || !privacyAccepted || !aiConsentAccepted) {
        return res.status(400).json({ error: 'age_consent_required' });
      }
      if (!isAtLeast18(month, year)) {
        return res.status(403).json({ error: 'age_restricted' });
      }

      const displayName = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
        : null;
      const syntheticEmail = `apple_${appleId.slice(0, 12)}@apple.lovetta.ai`;
      const ip = req.ip || '';
      const geo = await geoFromIp(ip).catch(() => ({}));
      const refCode = generateReferralCode();
      const referredBy = await resolveReferrer(pool, referralCode);

      const { rows: [newUser] } = await pool.query(
        `INSERT INTO users (email, apple_id, display_name, email_verified, birth_month, birth_year,
                            terms_accepted, privacy_accepted, ai_consent_at, ip_address, country, city, timezone, user_agent, auth_provider,
                            referral_code, referred_by, email_type, ts_click_id)
         VALUES ($1, $2, $3, TRUE, $4, $5, TRUE, TRUE, NOW(), $6, $7, $8, $9, $10, 'apple', $11, $12, 'synthetic', $13)
         RETURNING *`,
        [syntheticEmail, appleId, displayName, month, year,
         ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
         refCode, referredBy, tsClickId || null]
      );
      user = newUser;
      sendNewRegistrationNotification(newUser).catch(() => {});
      if (tsClickId) fireSignupPostback(tsClickId, newUser.id);
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [user.id]).catch(() => {});

    res.json({ user: sanitizeUser(user), accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] apple error:', err.message);
    res.status(500).json({ error: 'Apple sign-in failed' });
  }
});

// -- Telegram auth ----------------------------------------
const { validateInitData, BOT_USERNAME } = require('./telegram');

// POST /api/auth/telegram — validate Mini App initData, return tokens
router.post('/telegram', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const { initData, birthMonth: bm, birthYear: by,
            termsAccepted, privacyAccepted, aiConsentAccepted, referralCode: tgRefCode, tsClickId } = req.body || {};
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    const tgUser = validateInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ error: 'Invalid Telegram auth data' });
    }

    const telegramId = String(tgUser.id);
    const displayName = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ')
      || tgUser.username
      || `tg_${tgUser.id}`;

    // Check if telegram user exists
    const { rows: existingTg } = await pool.query(
      'SELECT u.* FROM telegram_users tu JOIN users u ON u.id = tu.user_id WHERE tu.telegram_id = $1',
      [telegramId]
    );

    let user;

    if (existingTg.length > 0) {
      user = existingTg[0];
      if (!user.ai_consent_at) {
        return res.status(400).json({ error: 'age_consent_required' });
      }
      // Update telegram info
      pool.query(
        'UPDATE telegram_users SET telegram_username = $2, telegram_first_name = $3, telegram_photo_url = $4 WHERE telegram_id = $1',
        [telegramId, tgUser.username, tgUser.firstName, tgUser.photoUrl]
      ).catch(() => {});
    } else {
      // Check if user has telegram_id in users table (legacy)
      const { rows: existingById } = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1', [telegramId]
      );

      if (existingById.length > 0) {
        user = existingById[0];
        if (!user.ai_consent_at) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        // Create telegram_users record
        await pool.query(
          'INSERT INTO telegram_users (telegram_id, user_id, telegram_username, telegram_first_name, telegram_photo_url) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [telegramId, user.id, tgUser.username, tgUser.firstName, tgUser.photoUrl]
        );
      } else {
        // Create new user — require age/consent data
        const month = parseInt(bm, 10);
        const year = parseInt(by, 10);
        if (!month || !year || !termsAccepted || !privacyAccepted || !aiConsentAccepted) {
          return res.status(400).json({ error: 'age_consent_required' });
        }
        if (!isAtLeast18(month, year)) {
          return res.status(403).json({ error: 'age_restricted' });
        }

        const syntheticEmail = `tg_${tgUser.id}@telegram.lovetta.ai`;
        const ip = req.ip || '';
        const geo = await geoFromIp(ip).catch(() => ({}));
        const refCode = generateReferralCode();
        const referredBy = await resolveReferrer(pool, tgRefCode);

        const { rows: [newUser] } = await pool.query(
          `INSERT INTO users (email, telegram_id, display_name, avatar_url, email_verified, birth_month, birth_year,
                              terms_accepted, privacy_accepted, ai_consent_at, ip_address, country, city, timezone, user_agent, auth_provider,
                              referral_code, referred_by, email_type, ts_click_id)
           VALUES ($1, $2, $3, $4, TRUE, $5, $6, TRUE, TRUE, NOW(), $7, $8, $9, $10, $11, 'telegram', $12, $13, 'synthetic', $14)
           RETURNING *`,
          [syntheticEmail, telegramId, displayName, tgUser.photoUrl, month, year,
           ip, geo.country || null, geo.city || null, geo.timezone || null, req.get('User-Agent') || null,
           refCode, referredBy, tsClickId || null]
        );
        user = newUser;
        sendNewRegistrationNotification(newUser).catch(() => {});
        if (tsClickId) fireSignupPostback(tsClickId, newUser.id);

        // Create telegram_users record
        await pool.query(
          'INSERT INTO telegram_users (telegram_id, user_id, telegram_username, telegram_first_name, telegram_photo_url) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [telegramId, user.id, tgUser.username, tgUser.firstName, tgUser.photoUrl]
        );
      }
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [user.id]).catch(() => {});

    res.json({ user: sanitizeUser(user), accessToken, refreshToken });
  } catch (err) {
    console.error('[auth] telegram error:', err.message);
    res.status(500).json({ error: 'Telegram auth failed' });
  }
});

module.exports = router;
