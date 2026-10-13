import { readAccessBody, boundedString } from '@/lib/access-input';
import { getDb } from '@/lib/db';
import {
  databaseErrorResponse,
  disabledResponse,
  normalizeSchoolRegistration,
  registrationEnabled,
  validBirthDate,
} from '@/lib/registration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const body = input.body;
  if (
    !boundedString(body.schoolRegistration, 32) ||
    !boundedString(body.birthDate, 10)
  )
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  const schoolRegistration = normalizeSchoolRegistration(
    body.schoolRegistration,
  );
  if (!schoolRegistration || !validBirthDate(body.birthDate))
    return Response.json({ result: 'unmatched' });
  try {
    const found = await getDb().student.findFirst({
      where: {
        schoolRegistration,
        birthDate: new Date(`${body.birthDate}T00:00:00Z`),
        registrationAllowed: true,
      },
      select: { account: { select: { status: true } } },
    });
    const status = found?.account?.status;
    return Response.json({
      result: !found
        ? 'unmatched'
        : status === 'active'
          ? 'created'
          : status === 'pending'
            ? 'pending'
            : 'eligible',
    });
  } catch {
    return databaseErrorResponse();
  }
}
