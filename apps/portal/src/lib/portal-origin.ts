import { configuredOrigin } from '../../../../shared/request-origin';
export {
  configuredOrigin,
  developmentOrigin,
} from '../../../../shared/request-origin';

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
