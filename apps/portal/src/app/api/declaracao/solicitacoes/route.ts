import { withApiCanonicalPath } from '@/lib/api-route';
import { currentSession } from '@/lib/session';
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
