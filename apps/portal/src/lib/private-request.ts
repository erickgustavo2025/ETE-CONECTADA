import { readJsonObject } from './request-body';
import { configuredOrigin, developmentOrigin } from './portal-origin';

export function sameOriginRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site')
    return false;
  try {
    const source = new URL(origin);
    if (source.origin !== origin) return false;
    const configured = env.PORTAL_PUBLIC_URL?.trim();
    if (configured) {
      const trusted = configuredOrigin(configured);
      return (
        trusted === origin &&
        (env.NODE_ENV === 'development' || trusted.startsWith('https://'))
      );
    }
    if (env.NODE_ENV !== 'development') return false;
    const url = new URL(request.url);
    // Host só auxilia o Next dev na LAN; não aceita um domínio público como fallback.
    const expected = developmentOrigin(
      `${url.protocol}//${request.headers.get('host') || url.host}`,
      env.NEXT_PUBLIC_LAN_HOST,
    );
    return expected !== null && origin === expected;
  } catch {
    return false;
  }
}

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function readPrivateBody(
  request: Request,
  limit: number,
): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  const input = await readJsonObject(request, limit);
  if ('status' in input)
    return {
      response: Response.json(
        {
          error:
            input.status === 413
              ? 'Dados enviados excedem o limite permitido.'
              : 'Não foi possível ler os dados enviados. Confira as informações e tente novamente.',
        },
        { status: input.status, headers: privateHeaders },
      ),
    };
  return input;
}
