import { emailTransport } from './email-transport';

export function portalAccessEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV === 'development') return true;
  // O transporte exige origem HTTPS explícita e configuração completa fora do desenvolvimento.
  return (
    env.NODE_ENV === 'production' &&
    env.PORTAL_ACCESS_MODE === 'school' &&
    env.HTTPS_VERIFIED === 'true' &&
    emailTransport(env) !== null
  );
}
