import { withApiCanonicalPath } from '@/lib/api-route';
import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { currentSessionHash } from '@/lib/session';
import { sessionCookiePolicy } from '@/lib/session-cookie';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const cookie = sessionCookiePolicy();
  const tokenHash = await currentSessionHash();
  if (tokenHash) {
    try {
      await getDb().session.deleteMany({
        where: { tokenHash },
      });
    } catch {
      /* O cookie ainda é removido se o banco estiver indisponível. */
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, '', {
    ...cookie.options,
    maxAge: 0,
    expires: new Date(0),
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const POST = withApiCanonicalPath(handlePOST);
