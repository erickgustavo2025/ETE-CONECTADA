import { readJsonObject } from './request-body';

export const ACCESS_BODY_LIMIT = 4096;

const inputError = (status: number) =>
  Response.json(
    {
      error:
        status === 413
          ? 'Dados enviados excedem o limite permitido.'
          : 'Dados inválidos.',
    },
    { status },
  );

// Content-Length serve apenas para recusar cedo; o limite também vale para bytes reais do stream.
export async function readAccessBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  const input = await readJsonObject(request, ACCESS_BODY_LIMIT);
  return 'status' in input ? { response: inputError(input.status) } : input;
}

export function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

// Mantém a regra do cadastro, sem truncar, normalizar ou remover espaços da senha.
export function validAccessPassword(value: unknown): value is string {
  return boundedString(value, 128) && value.length >= 8;
}
