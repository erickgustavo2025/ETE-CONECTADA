export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(request.url);
    // Next dev pode usar 0.0.0.0 internamente; Host identifica o IP/domínio acessado.
    const expected = new URL(`${url.protocol}//${request.headers.get('host') || url.host}`).origin;
    return new URL(origin).origin === expected;
  }
  catch { return false; }
}

export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
