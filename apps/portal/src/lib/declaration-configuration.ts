import { verificationLink } from './public-verification-input';
export type DeclarationMode = 'PREVIEW' | 'SCHOOL';

// Configuração exclusivamente do servidor. Uma tentativa escolar incompleta não
// pode cair silenciosamente no modo anterior nem obter a origem de Host/forwarded.
export function declarationMode(
  env: Record<string, string | undefined> = process.env,
): DeclarationMode | null {
  const environment = env.NODE_ENV;
  if (
    environment !== 'development' &&
    environment !== 'test' &&
    environment !== 'production'
  )
    return null;
  if (env.DECLARATION_ISSUANCE_MODE !== undefined) {
    if (
      env.DECLARATION_ISSUANCE_MODE !== 'school' ||
      typeof env.PORTAL_PUBLIC_URL !== 'string'
    )
      return null;
    try {
      verificationLink('A'.repeat(43), env.PORTAL_PUBLIC_URL, environment);
      return 'SCHOOL';
    } catch {
      return null;
    }
  }
  return ['development', 'test'].includes(env.NODE_ENV ?? '') &&
    env.DECLARATION_REGISTRY_PREVIEW === 'true'
    ? 'PREVIEW'
    : null;
}
export function declarationPortalEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return declarationMode(env) !== null;
}
