import { readJsonObject } from './request-body';
import { apiSecurityHeaders } from '../../../../shared/security-headers';
import { trustedOrigin } from '../../../../shared/request-origin';

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
    const expected = trustedOrigin(
      request.url,
      request.headers.get('host'),
      env.PORTAL_PUBLIC_URL,
      env,
    );
    return expected !== null && origin === expected;
  } catch {
    return false;
  }
}

export const privateHeaders = apiSecurityHeaders;

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
