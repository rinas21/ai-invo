import { json } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

const COOKIE_NAME = 'invomemo_session';

export function GET({ cookies }) {
  const token = cookies.get(COOKIE_NAME);
  const id = token ? validateSession(token) : null;
  return json({ authenticated: !!id });
}
