import { withApiCanonicalPath } from '@/lib/api-route';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
import { issueDeclaration } from '@/lib/declaration-issuance';
import { readIssuanceInput } from '@/lib/declaration-issuance-input';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import {
  privateHeaders,
  sameOriginRequest,
  readPrivateBody,
} from '@/lib/private-request';
import {
  requestDeclaration,
  requestFailure,
  studentRequests,
  validRequestId,
  requestSummary,
  requestSummarySelect,
} from '@/lib/declaration-requests';
export const runtime = 'nodejs';
async function handleGET() {
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: 'Entre novamente para continuar.' },
        { status: 401, headers: privateHeaders },
      );
    return Response.json(
      { requests: await studentRequests(session.studentId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = requestFailure(error);
    return Response.json(
      { error: failure.error },
      { status: failure.status, headers: privateHeaders },
    );
  }
}
async function handlePOST(request: Request) {
  if (
    process.env.DECLARATION_ISSUANCE_MODE !== undefined &&
    !declarationPortalEnabled()
  )
    return Response.json(
      { error: 'A emissão está indisponível. Procure a secretaria.' },
      { status: 503, headers: privateHeaders },
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
    const input = await readPrivateBody(request, 1000);
    if ('response' in input) return input.response;
    const body = input.body;
    if (declarationPortalEnabled()) {
      if (session.role !== 'student')
        return Response.json(
          { error: 'Entre com sua conta de aluno.' },
          { status: 403, headers: privateHeaders },
        );
      // Nenhum campo de identidade, autorização ou conteúdo do PDF é aceito.
      const { birthplace, ...intent } = body;
      const value = readIssuanceInput(intent);
      const db = getDb();
      const limit = accessLimitResponse(
        await consumeAccessAttempt(db, 'issuance', session.accountId),
      );
      if (limit) {
        for (const [name, value] of Object.entries(privateHeaders))
          limit.headers.set(name, value);
        return limit;
      }
      const issued = await issueDeclaration(
        session.accountId,
        value,
        birthplace,
      );
      const row = await db.declarationRequest.findUniqueOrThrow({
        where: { documentId: issued.document.id },
        select: requestSummarySelect,
      });
      return Response.json(
        { request: requestSummary(row), created: issued.created },
        { status: issued.created ? 201 : 200, headers: privateHeaders },
      );
    }
    if (!body || !validRequestId(body.enrollmentId))
      return Response.json(
        { error: 'Escolha sua matrícula.' },
        { status: 400, headers: privateHeaders },
      );
    // A identidade vem da sessão. Nenhum studentId enviado pelo cliente é usado.
    const result = await requestDeclaration(
      session.studentId,
      body.enrollmentId,
      { accountId: session.accountId, birthplace: body.birthplace },
    );
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers: privateHeaders,
    });
  } catch (error) {
    const failure = requestFailure(error);
    return Response.json(
      { error: failure.error },
      { status: failure.status, headers: privateHeaders },
    );
  }
}

export const GET = withApiCanonicalPath(handleGET);
export const POST = withApiCanonicalPath(handlePOST);
