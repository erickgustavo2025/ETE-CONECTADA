import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashSessionToken } from '@/lib/session';
import { sessionCookiePolicy } from '@/lib/session-cookie';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const cookie = sessionCookiePolicy();
  const token = (await cookies()).get(cookie.name)?.value;
  if (process.env.NODE_ENV === 'development' && token) {
    try {
      await getDb().session.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
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
