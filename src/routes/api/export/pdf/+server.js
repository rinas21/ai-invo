import { json, error } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';
import { buildPdf } from '$lib/server/export';

const COOKIE_NAME = 'invomemo_session';

function authenticate(cookies) {
  const token = cookies.get(COOKIE_NAME);
  if (!token || !validateSession(token)) {
    throw error(401, 'Authentication required.');
  }
}

export async function POST({ request, cookies }) {
  authenticate(cookies);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { html } = body || {};
  if (typeof html !== 'string' || !html.trim()) {
    return json({ error: 'No memo content provided.' }, { status: 400 });
  }

  try {
    const buffer = await buildPdf(html);
    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="payment_approval_memo.pdf"',
        'content-length': String(buffer.length),
      },
    });
  } catch {
    return json({ error: 'Failed to generate PDF.' }, { status: 500 });
  }
}
