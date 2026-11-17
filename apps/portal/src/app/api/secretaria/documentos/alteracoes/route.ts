import { currentSession } from '@/lib/session';
import { canManageDeclarations } from '@/lib/declaration-access';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
import {
  changeDeclarationDocument,
  readDocumentAction,
} from '@/lib/declaration-document-actions';
import { requestFailure } from '@/lib/declaration-requests';
import { DeclarationValidationError } from '@/lib/declarations';
import {
  privateHeaders,
  sameOriginRequest,
  readPrivateBody,
} from '@/lib/private-request';
import { withApiCanonicalPath } from '@/lib/api-route';

export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  if (!declarationPortalEnabled())
    return Response.json(
      { error: 'Página não disponível.' },
      { status: 404, headers: privateHeaders },
    );
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: 'Entre novamente para continuar.' },
        { status: 401, headers: privateHeaders },
      );
    if (!canManageDeclarations(session.role))
      return Response.json(
        {
          error: 'Somente a secretaria pode alterar a situação de uma minuta.',
        },
        { status: 403, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 4000);
    if ('response' in input) return input.response;
    const result = await changeDeclarationDocument(
      readDocumentAction(input.body),
      session.accountId,
    );
    return Response.json(
      {
        state: result.action.action,
        recordedAt: result.action.createdAt.toISOString(),
      },
      { status: result.created ? 201 : 200, headers: privateHeaders },
    );
  } catch (error) {
    const result = requestFailure(error);
    return Response.json(
      {
        error: result.error,
        ...(error instanceof DeclarationValidationError
          ? { field: error.field }
          : {}),
      },
      { status: result.status, headers: privateHeaders },
    );
  }
}
export const POST = withApiCanonicalPath(handlePOST);
