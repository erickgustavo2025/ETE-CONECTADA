import { withApiCanonicalPath } from '@/lib/api-route';
import { getDb } from '@/lib/db';
import { currentSession } from '@/lib/session';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
import {
  readArchivedDeclarationPdf,
  PdfArchiveError,
} from '@/lib/declaration-pdf-archive';
import {
  privateHeaders,
  readPrivateBody,
  sameOriginRequest,
} from '@/lib/private-request';

export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  if (!declarationRegistryPreviewEnabled())
    return Response.json(
      { error: 'Recurso indisponível.' },
      { status: 404, headers: privateHeaders },
    );
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: 'Entre novamente para continuar.' },
        { status: 401, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 1000);
    if ('response' in input) return input.response;
    if (
      typeof input.body.documentId !== 'string' ||
      (input.body.download !== undefined &&
        typeof input.body.download !== 'boolean') ||
      Object.keys(input.body).some(
        (key) => !['documentId', 'download'].includes(key),
      )
    ) {
      return Response.json(
        { error: 'Escolha um documento.' },
        { status: 400, headers: privateHeaders },
      );
    }
    const file = await readArchivedDeclarationPdf(
      getDb(),
      session.accountId,
      input.body.documentId,
    );
    return new Response(Buffer.from(file.bytes), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${input.body.download ? 'attachment' : 'inline'}; filename="declaracao-original-minuta.pdf"`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof PdfArchiveError
            ? error.message
            : 'Não foi possível abrir o arquivo original.',
      },
      {
        status: error instanceof PdfArchiveError ? error.status : 503,
        headers: privateHeaders,
      },
    );
  }
}
export const POST = withApiCanonicalPath(handlePOST);
