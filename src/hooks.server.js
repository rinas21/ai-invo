import { validateSession } from '$lib/server/auth';

const COOKIE_NAME = 'invomemo_session';

function isProtected(pathname) {
  return (
    pathname.startsWith('/generate') ||
    pathname.startsWith('/api/generate') ||
    pathname.startsWith('/api/export')
  );
}

function handleAuth({ event, resolve }) {
  const { url } = event;
  const pathname = url.pathname;

  const token = event.cookies.get(COOKIE_NAME);
  const sessionId = token ? validateSession(token) : null;
  event.locals.sessionId = sessionId || null;
  event.locals.authenticated = !!sessionId;

  if (isProtected(pathname) && !sessionId) {
    if (pathname.startsWith('/api')) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  if (pathname === '/login' && sessionId) {
    return new Response(null, { status: 302, headers: { location: '/generate' } });
  }

  return resolve(event);
}

export const handle = handleAuth;

export const handleError = ({ error }) => {
  console.error('Unhandled error:', error);
  return {
    message: 'An unexpected error occurred. Please try again.',
  };
};
