import { currentSession } from '@/lib/session';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
import { listSchoolClasses } from '@/lib/school-class-catalogue';
import { administerStudents } from '@/lib/student-administration';
import { requestFailure } from '@/lib/declaration-requests';
import {
  privateHeaders,
  sameOriginRequest,
  readPrivateBody,
} from '@/lib/private-request';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { getDb } from '@/lib/db';
import { withApiCanonicalPath } from '@/lib/api-route';
export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  if (!declarationRegistryPreviewEnabled())
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
    if (session.role !== 'secretary')
      return Response.json(
        { error: 'Somente a secretaria pode administrar alunos.' },
        { status: 403, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 4000);
    if ('response' in input) return input.response;
    const limit = accessLimitResponse(
      await consumeAccessAttempt(
        getDb(),
        input.body.operation === 'change'
          ? 'student-admin-change'
          : 'student-admin-search',
        session.accountId,
      ),
    );
    if (limit) {
      for (const [k, v] of Object.entries(privateHeaders))
        limit.headers.set(k, v);
      return limit;
    }
    return Response.json(
      input.body.operation === 'classes'
        ? await listSchoolClasses(session.accountId, input.body)
        : await administerStudents(session.accountId, input.body),
      { headers: privateHeaders },
    );
  } catch (error) {
    const result = requestFailure(error);
    return Response.json(
      { error: result.error },
      { status: result.status, headers: privateHeaders },
    );
  }
}
export const POST = withApiCanonicalPath(handlePOST);
