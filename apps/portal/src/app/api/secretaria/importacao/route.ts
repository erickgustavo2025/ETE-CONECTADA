import { withRepeaterSelections } from '@/lib/school-repeater-input';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { withApiCanonicalPath } from '@/lib/api-route';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
import {
  parseSheetInput,
  inspectSchoolSheet,
  SheetImportError,
  SHEET_BODY_LIMIT,
} from '@/lib/sheet-import-input';
import {
  previewSheetImport,
  confirmSheetImport,
  schoolImportSources,
  suggestRepeaterPlacements,
} from '@/lib/sheet-import';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
async function bodyOf(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw new SheetImportError(
      'Não foi possível ler os dados enviados. Selecione o arquivo novamente.',
      415,
    );
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
async function handlePOST(request: Request) {
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
            'format',
            'contexts',
            'fileBase64',
            'token',
            'confirmed',
            'acceptIdentityChanges',
            'acceptCalendarDifferences',
            'acceptRepeaterPlacements',
            'repeaters',
            'sheetName',
            'page',
          ].includes(k),
      ) ||
      typeof body.action !== 'string' ||
      !['inspect', 'preview', 'confirm', 'repeaters'].includes(body.action) ||
      typeof body.fileBase64 !== 'string' ||
      !body.fileBase64.length ||
      body.fileBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.fileBase64)
    )
      throw new SheetImportError(
        'Confira o arquivo, a ação e o contexto.',
        400,
      );
    if (body.format !== undefined && body.format !== 'school-header-v1')
      throw new SheetImportError('Leia o arquivo novamente.', 400);
    const automatic = body.format === 'school-header-v1';
    const file = Buffer.from(body.fileBase64, 'base64');
    if (file.toString('base64') !== body.fileBase64)
      throw new SheetImportError('Arquivo inválido.', 400);
    if (body.action === 'inspect') {
      if (
        (body.mode !== 'INTEGRADO' && body.mode !== 'SUBSEQUENTE') ||
        Object.keys(body).some(
          (key) => !['action', 'mode', 'format', 'fileBase64'].includes(key),
        )
      )
        throw new SheetImportError(
          'Escolha a modalidade e envie somente o arquivo para inspeção.',
          400,
        );
      const sheets = await inspectSchoolSheet(file, body.mode, automatic);
      const sources = await schoolImportSources(
        getDb(),
        session.accountId,
        body.mode,
      );
      return json({ sheets, sources });
    }
    const input = await parseSheetInput(
      file,
      body.mode,
      body.contexts,
      automatic,
    );
    if (
      (body.action === 'repeaters' || body.repeaters !== undefined) &&
      !declarationPortalEnabled()
    )
      return json({ error: 'Página não disponível.' }, 404);
    if (body.action === 'repeaters') {
      if (body.repeaters !== undefined)
        throw new SheetImportError(
          'Consulte os repetentes antes de escolher.',
          400,
        );
      const limited = accessLimitResponse(
        await consumeAccessAttempt(
          getDb(),
          'student-admin-search',
          session.accountId,
        ),
      );
      if (limited) {
        for (const [k, v] of Object.entries(privateHeaders))
          limited.headers.set(k, v);
        return limited;
      }
      return json(
        await suggestRepeaterPlacements(
          getDb(),
          session.accountId,
          input,
          body.sheetName,
          body.page,
        ),
      );
    }
    if (body.sheetName !== undefined || body.page !== undefined)
      throw new SheetImportError('Confira os campos da importação.', 400);
    const selectedInput = withRepeaterSelections(input, body.repeaters);
    const result =
      body.action === 'preview'
        ? await previewSheetImport(getDb(), session.accountId, selectedInput)
        : await confirmSheetImport(
            getDb(),
            session.accountId,
            selectedInput,
            body.token,
            body.confirmed,
            body.acceptIdentityChanges,
            body.acceptCalendarDifferences,
            body.acceptRepeaterPlacements,
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

export const POST = withApiCanonicalPath(handlePOST);
