import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import {
  getAppPassword,
  createSession,
  isRateLimited,
  registerLoginAttempt,
  getClientIp,
  SESSION_MAX_AGE_MS,
} from '$lib/server/auth';

const COOKIE_NAME = 'invomemo_session';

function setSessionCookie(cookies, token) {
  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export async function POST({ request, cookies }) {
  const ip = getClientIp({
    request,
    getClientAddress: () => request.headers.get('x-forwarded-for') || '127.0.0.1',
  });

  if (isRateLimited(ip)) {
    return json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, { status: 429 });
  }

  const appPassword = getAppPassword();
  if (!appPassword) {
    return json(
      { error: 'Server authentication is not configured. The APP_PASSWORD environment variable is missing.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const { password } = body || {};
  if (typeof password !== 'string' || !password.trim()) {
    registerLoginAttempt(ip, false);
    return json({ error: 'Please enter a password.' }, { status: 400 });
  }

  const userBuf = Buffer.from(password, 'utf8');
  const appBuf = Buffer.from(appPassword, 'utf8');
  const isMatch = userBuf.length === appBuf.length && crypto.timingSafeEqual(userBuf, appBuf);

  if (!isMatch) {
    registerLoginAttempt(ip, false);
    return json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
  }

  registerLoginAttempt(ip, true);
  const token = createSession();
  setSessionCookie(cookies, token);

  return json({ ok: true, message: 'Logged in successfully.' });
}
