import { json } from '@sveltejs/kit';
import { validateSession, destroySession } from '$lib/server/auth';

const COOKIE_NAME = 'invomemo_session';

export async function POST({ cookies }) {
  const token = cookies.get(COOKIE_NAME);
  if (token) {
    const id = validateSession(token);
    if (id) destroySession(id);
  }
  cookies.delete(COOKIE_NAME, { path: '/' });
  return json({ ok: true, message: 'Logged out successfully.' });
}
