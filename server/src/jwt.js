/**
 * JWT token generation and verification.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

function generateAccessToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

function generateVerifyToken(email) {
  return jwt.sign({ email, purpose: 'verify' }, JWT_SECRET, { expiresIn: '24h' });
}

function verifyVerifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.purpose !== 'verify') throw new Error('Invalid token purpose');
  return decoded;
}

function generateResetToken(email) {
  return jwt.sign({ email, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
}

function verifyResetToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.purpose !== 'reset') throw new Error('Invalid token purpose');
  return decoded;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateVerifyToken,
  verifyVerifyToken,
  generateResetToken,
  verifyResetToken,
  hashToken,
};
