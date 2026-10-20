import { configuredOrigin } from './portal-origin';

export const sessionDurationSeconds = 60 * 60 * 24 * 7;

// A origem é configuração do servidor; cabeçalhos de cliente não mudam esta política.
export function sessionCookiePolicy(
  env: Record<string, string | undefined> = process.env,
) {
  const origin = configuredOrigin(env.PORTAL_PUBLIC_URL);
  const localHttp =
    env.NODE_ENV === 'development' &&
    (!env.PORTAL_PUBLIC_URL?.trim() || origin?.startsWith('http://'));
  const secure = !localHttp;
  return {
    name: secure ? '__Host-ete_portal_session' : 'ete_portal_session',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: sessionDurationSeconds,
    },
  };
}
