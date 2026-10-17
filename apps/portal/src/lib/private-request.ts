import { readJsonObject } from './request-body';

export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(request.url);
    // Next dev pode usar 0.0.0.0 internamente; Host identifica o IP/domínio acessado.
    const expected = new URL(
      `${url.protocol}//${request.headers.get('host') || url.host}`,
    ).origin;
    return new URL(origin).origin === expected;
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
