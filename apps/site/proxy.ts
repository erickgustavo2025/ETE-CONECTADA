import { randomBytes } from 'node:crypto';
import { trustedOrigin } from '../../shared/request-origin';
import { NextResponse, type NextRequest } from 'next/server';
import { requestSecurityHeaders } from '../../shared/security-headers';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64');
  const security = requestSecurityHeaders(nonce);
  const headers = new Headers(request.headers);
  // Sobrescreve qualquer valor recebido; só o servidor escolhe nonce e política.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', security['Content-Security-Policy']);
  const url = new URL(request.url);
  const path = url.pathname;
  const origin =
    path !== '/' && path.endsWith('/')
      ? trustedOrigin(
          request.url,
          request.headers.get('host'),
          process.env.SITE_PUBLIC_URL,
        )
      : null;
  const response =
    path !== '/' && path.endsWith('/')
      ? origin
        ? NextResponse.redirect(
            new URL(
              '/' + path.replace(/\/+$/, '').replace(/^\/+/, '') + url.search,
              origin,
            ),
            308,
          )
        : NextResponse.json(
            { error: 'Solicitação não autorizada.' },
            { status: 400 },
          )
      : NextResponse.next({ request: { headers } });
  for (const [name, value] of Object.entries(security))
    response.headers.set(name, value);
  return response;
}

export const config = {
  // Não pula HTML/API por cabeçalho de prefetch. APIs usam cabeçalhos estáticos, sem buffer de corpo; recursos públicos ficam fora.
  matcher: [
    '/((?!api(?:/|$)|_next/static/|_next/image$|images/|favicon\\.ico$).*)',
  ],
};
