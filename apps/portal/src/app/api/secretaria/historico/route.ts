import { currentSession } from '@/lib/session';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
import { listAuditHistory } from '@/lib/audit-history';
import { parseAuditFilters } from '@/lib/audit-history-input';
import {
  privateHeaders,
  readPrivateBody,
  sameOriginRequest,
} from '@/lib/private-request';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { getDb } from '@/lib/db';
import { withApiCanonicalPath } from '@/lib/api-route';

export const runtime = 'nodejs';

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

async function handlePOST(request: Request) {
  if (!declarationPortalEnabled())
    return failure('Página não disponível.', 404);
  if (!sameOriginRequest(request))
    return failure('Origem não autorizada.', 403);
  try {
    const session = await currentSession();
    if (!session) return failure('Entre novamente para continuar.', 401);
    if (session.role !== 'secretary')
      return failure('Consulta restrita à secretaria.', 403);
    const input = await readPrivateBody(request, 2000);
    if ('response' in input) return input.response;
    const filters = parseAuditFilters(input.body);
    if (!filters)
      return failure(
        'Confira a categoria, as datas e o nome ou a matrícula.',
        422,
      );
    const limit = accessLimitResponse(
      await consumeAccessAttempt(
        getDb(),
        'student-admin-search',
        session.accountId,
      ),
    );
    if (limit) {
      for (const [key, value] of Object.entries(privateHeaders))
        limit.headers.set(key, value);
      return limit;
    }
    const result = await listAuditHistory(session.accountId, filters);
    return result
      ? Response.json(result, { headers: privateHeaders })
      : failure('Consulta restrita à secretaria.', 403);
  } catch {
    return failure(
      'Não foi possível consultar o histórico. Tente novamente.',
      503,
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
