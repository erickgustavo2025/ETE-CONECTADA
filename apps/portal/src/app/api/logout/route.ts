import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashSessionToken, sessionCookieName } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const token = (await cookies()).get(sessionCookieName)?.value;
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
  response.cookies.delete(sessionCookieName);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
