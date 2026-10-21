import crypto from 'crypto';
import { env } from '$env/dynamic/private';

export function getAppPassword() {
  return env.APP_PASSWORD || process.env.APP_PASSWORD || '';
}

function getSessionSecret() {
  const pwd = getAppPassword();
  return pwd || 'invomemo-default-session-secret-key-32b';
}

export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 hours

// Revoked session IDs (for explicit logout)
const revokedSessions = new Set();

// In-memory login rate limiter (fixed window per IP)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 1000 * 60 * 15; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;

function makeSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

export function createSession() {
  const id = makeSessionId();
  const timestamp = Date.now().toString();
  const payload = `${id}.${timestamp}`;
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

export function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, timestampStr, sig] = parts;
  const timestamp = Number(timestampStr);
  if (!timestamp || isNaN(timestamp)) return null;

  // Check expiration
  if (Date.now() - timestamp > SESSION_MAX_AGE_MS) return null;

  // Check revocation
  if (revokedSessions.has(id)) return null;

  // Validate HMAC signature using timing safe compare
  const payload = `${id}.${timestampStr}`;
  const expected = signPayload(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  return id;
}

export function destroySession(tokenOrId) {
  if (!tokenOrId) return;
  if (tokenOrId.includes('.')) {
    const id = tokenOrId.split('.')[0];
    revokedSessions.add(id);
  } else {
    revokedSessions.add(tokenOrId);
  }
}

export function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= LOGIN_MAX_ATTEMPTS;
}

export function registerLoginAttempt(ip, success) {
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

export function getClientIp(event) {
  const forwarded = event.request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return event.getClientAddress ? event.getClientAddress() : 'unknown';
}
