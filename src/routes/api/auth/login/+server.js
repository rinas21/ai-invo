import { json, error } from '@sveltejs/kit';
import { APP_PASSWORD } from '$env/static/private';
import {
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
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
}

export async function POST({ request, cookies }) {
  const ip = getClientIp({ request, getClientAddress: () => request.headers.get('x-forwarded-for') });

  if (isRateLimited(ip)) {
    return json({ error: 'Too many login attempts. Try again later.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { password } = body || {};
  if (typeof password !== 'string') {
    registerLoginAttempt(ip, false);
    return json({ error: 'Invalid credentials.' }, { status: 400 });
  }

  if (!APP_PASSWORD) {
    return json({ error: 'Server is not configured.' }, { status: 500 });
  }

  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(APP_PASSWORD, 'utf8');
  let match = a.length === b.length;
  if (match) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) match = false;
    }
  }

  if (!match) {
    registerLoginAttempt(ip, false);
    return json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  registerLoginAttempt(ip, true);
  const token = createSession();
  setSessionCookie(cookies, token);

  return json({ ok: true });
}
