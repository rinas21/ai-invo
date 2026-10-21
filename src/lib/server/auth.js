import crypto from 'crypto';

const SESSION_SECRET = process.env.APP_PASSWORD || 'dev-insecure-change-me';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 hours

// In-memory session store (single-instance demo; fine for Vercel serverless).
const sessions = new Map();

// In-memory login rate limiter (fixed window per IP).
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 1000 * 60 * 15; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;

function makeSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function signSession(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
}

function createSession() {
  const id = makeSessionId();
  const sig = signSession(id);
  sessions.set(id, { createdAt: Date.now() });
  return `${id}.${sig}`;
}

function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signSession(id);
  if (sig !== expected || !sessions.has(id)) return null;
  return id;
}

function destroySession(id) {
  sessions.delete(id);
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= LOGIN_MAX_ATTEMPTS;
}

function registerLoginAttempt(ip, success) {
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, record);
  }
  if (success) {
    loginAttempts.delete(ip);
  } else {
    record.count += 1;
  }
}

function getClientIp(event) {
  const forwarded = event.request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return event.getClientAddress ? event.getClientAddress() : 'unknown';
}

export {
  sessions,
  createSession,
  validateSession,
  destroySession,
  SESSION_MAX_AGE_MS,
  SESSION_SECRET,
  isRateLimited,
  registerLoginAttempt,
  getClientIp,
};
