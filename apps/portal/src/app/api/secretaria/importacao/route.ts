import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
import {
  parseSheetInput,
  inspectIntegratedSheet,
  SheetImportError,
  SHEET_BODY_LIMIT,
} from '@/lib/sheet-import-input';
import {
  previewSheetImport,
  confirmSheetImport,
  integratedImportSources,
} from '@/lib/sheet-import';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
async function bodyOf(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw new SheetImportError('Envie JSON válido.', 415);
  if (Number(request.headers.get('content-length')) > SHEET_BODY_LIMIT) {
    void request.body?.cancel().catch(() => {});
    throw new SheetImportError('Upload acima do limite.', 413);
  }
  if (!request.body)
    throw new SheetImportError('Envie o arquivo e o contexto.', 400);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SHEET_BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new SheetImportError('Upload acima do limite.', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } finally {
    reader.releaseLock();
  }
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return json({ error: 'Origem não autorizada.' }, 403);
  try {
    const session = await currentSession();
    if (!session)
      return json({ error: 'Entre novamente para continuar.' }, 401);
    if (session.role !== 'secretary')
      return json({ error: 'Acesso exclusivo da secretaria.' }, 403);
    const value = await bodyOf(request);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new SheetImportError('Confira os dados.', 400);
    const body = value as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (k) =>
          ![
            'action',
            'mode',
            'contexts',
            'fileBase64',
            'token',
            'confirmed',
            'acceptIdentityChanges',
          ].includes(k),
      ) ||
      typeof body.action !== 'string' ||
      !['inspect', 'preview', 'confirm'].includes(body.action) ||
      typeof body.fileBase64 !== 'string' ||
      !body.fileBase64.length ||
      body.fileBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.fileBase64)
    )
      throw new SheetImportError(
        'Confira o arquivo, a ação e o contexto.',
        400,
      );
    const file = Buffer.from(body.fileBase64, 'base64');
    if (file.toString('base64') !== body.fileBase64)
      throw new SheetImportError('Arquivo inválido.', 400);
    if (body.action === 'inspect') {
      if (
        body.mode !== 'INTEGRADO' ||
        Object.keys(body).some(
          (key) => !['action', 'mode', 'fileBase64'].includes(key),
        )
      )
        throw new SheetImportError(
          'Use a entrada do integrado para este arquivo.',
          400,
        );
      const sheets = await inspectIntegratedSheet(file);
      const sources = await integratedImportSources(getDb(), session.accountId);
      return json({ sheets, sources });
    }
    const input = await parseSheetInput(file, body.mode, body.contexts);
    const result =
      body.action === 'preview'
        ? await previewSheetImport(getDb(), session.accountId, input)
        : await confirmSheetImport(
            getDb(),
            session.accountId,
            input,
            body.token,
            body.confirmed,
            body.acceptIdentityChanges,
          );
    return json(result);
  } catch (error) {
    if (error instanceof SheetImportError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return json({ error: 'Dados inválidos.' }, 400);
    // Sem objetos Prisma, linhas, nomes, matrícula ou conteúdo do arquivo nos logs.
    return json(
      {
        error:
          'A importação não foi aplicada. Confira a conexão, atualize a prévia e tente novamente.',
      },
      409,
    );
  }
}
