import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { readAccessBody, boundedString } from '@/lib/access-input';
import { getDb } from '@/lib/db';
import {
  databaseErrorResponse,
  disabledResponse,
  normalizeSchoolRegistration,
  registrationEnabled,
  normalizeParentName,
  matchesRegisteredParent,
  validBirthDate,
} from '@/lib/registration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const body = input.body;
  if (
    !boundedString(body.schoolRegistration, 32) ||
    !boundedString(body.birthDate, 10) ||
    !normalizeParentName(body.parentName)
  )
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  const schoolRegistration = normalizeSchoolRegistration(
    body.schoolRegistration,
  );
  if (!schoolRegistration || !validBirthDate(body.birthDate))
    return Response.json({ result: 'unmatched' });
  try {
    const limit = accessLimitResponse(
      await consumeAccessAttempt(getDb(), 'registration', schoolRegistration),
    );
    if (limit) return limit;
    const found = await getDb().student.findFirst({
      where: {
        schoolRegistration,
        birthDate: new Date(`${body.birthDate}T00:00:00Z`),
        registrationAllowed: true,
      },
      select: {
        account: { select: { status: true } },
        details: {
          select: { parentOne: true, parentTwo: true, parentageSource: true },
        },
      },
    });
    // Mesmo resultado público para ausente, bloqueado e filiação divergente.
    if (!found || !matchesRegisteredParent(body.parentName, found.details))
      return Response.json(
        { result: 'unmatched' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    const status = found.account?.status;
    return Response.json(
      {
        result:
          status === 'active'
            ? 'created'
            : status === 'pending'
              ? 'pending'
              : 'eligible',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return databaseErrorResponse();
  }
}
