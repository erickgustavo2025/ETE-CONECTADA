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
  if (Number(request.headers.get('content-length')) > ACCESS_BODY_LIMIT) {
    void request.body?.cancel().catch(() => {});
    return { response: inputError(413) };
  }
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    return { response: inputError(415) };
  if (!request.body) return { response: inputError(400) };
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > ACCESS_BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        return { response: inputError(413) };
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return { response: inputError(400) };
    return { body: body as Record<string, unknown> };
  } catch {
    return { response: inputError(400) };
  } finally {
    reader.releaseLock();
  }
}

export function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

// Mantém a regra do cadastro, sem truncar, normalizar ou remover espaços da senha.
export function validAccessPassword(value: unknown): value is string {
  return boundedString(value, 128) && value.length >= 8;
}
