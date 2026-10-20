export const baseSecurityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// APIs devolvem JSON/PDF; não passam pelo Proxy para preservar recusa de uploads em aberto.
export const apiSecurityHeaders: Record<string, string> = {
  ...baseSecurityHeaders,
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy':
    "default-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function requestSecurityHeaders(
  nonce: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (!/^[A-Za-z0-9+/]{24,}={0,2}$/.test(nonce))
    throw new Error('Nonce de segurança inválido.');
  const development = env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // React usa estilos de atributo para medidas e estados; isso não permite scripts inline.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    ...baseSecurityHeaders,
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': policy,
    // Declaração operacional explícita após conferir TLS/proxy; nunca usar forwarded do cliente.
    ...(env.NODE_ENV === 'production' && env.HTTPS_VERIFIED === 'true'
      ? { 'Strict-Transport-Security': 'max-age=15552000' }
      : {}),
  };
}
