import { json } from '@sveltejs/kit';
import { validateSession, destroySession } from '$lib/server/auth';

const COOKIE_NAME = 'invomemo_session';

export async function POST({ cookies }) {
  const token = cookies.get(COOKIE_NAME);
  if (token) {
    const id = validateSession(token);
    if (id) destroySession(id);
  }
  cookies.set(COOKIE_NAME, '', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0 });
  return json({ ok: true });
}
