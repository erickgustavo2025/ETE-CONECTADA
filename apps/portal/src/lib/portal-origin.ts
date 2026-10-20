// Configuração do servidor; nunca derivar links de Host/forwarded do pedido.
export function configuredOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      )
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function developmentOrigin(
  value: string,
  trustedLocalHost?: string,
): string | null {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !['http:', 'https:'].includes(url.protocol)
    )
      return null;
    const configuredLocalName = trustedLocalHost?.trim().toLowerCase();
    const trustedName =
      configuredLocalName &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.(?:local|lan))?$/.test(
        configuredLocalName,
      ) &&
      url.hostname === configuredLocalName;
    const local =
      trustedName ||
      ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname) ||
      /^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        url.hostname,
      );
    return local ? url.origin : null;
  } catch {
    return null;
  }
}

export function verificationUrl(
  token: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const path = `/confirmar-email?${new URLSearchParams({ token })}`;
  const origin = configuredOrigin(env.PORTAL_PUBLIC_URL);
  if (
    origin &&
    (env.NODE_ENV === 'development' || origin.startsWith('https://'))
  )
    return new URL(path, origin).toString();
  // Sem remetente configurado, o link de demonstração é relativo à página aberta.
  // Assim funciona na LAN sem transformar Host em destino de um segredo.
  if (!env.PORTAL_PUBLIC_URL?.trim() && env.NODE_ENV === 'development')
    return path;
  return null;
}
