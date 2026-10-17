type JsonBodyResult =
  | { body: Record<string, unknown> }
  | { status: 400 | 413 | 415 };

// O cabeçalho é apenas uma recusa antecipada; também conta os bytes reais do stream.
export async function readJsonObject(
  request: Request,
  limit: number,
): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('Limite de leitura inválido.');
  if (Number(request.headers.get('content-length')) > limit) {
    void request.body?.cancel().catch(() => {});
    return { status: 413 };
  }
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    return { status: 415 };
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return { status: 400 };
    return { body: body as Record<string, unknown> };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}
