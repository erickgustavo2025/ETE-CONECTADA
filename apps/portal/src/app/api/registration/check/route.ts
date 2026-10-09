import { getDb } from '@/lib/db';
import { databaseErrorResponse, disabledResponse, normalizeSchoolRegistration, registrationEnabled, validBirthDate } from '@/lib/registration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  const schoolRegistration = normalizeSchoolRegistration(body.schoolRegistration);
  if (!schoolRegistration || !validBirthDate(body.birthDate)) return Response.json({ result: 'unmatched' });
  try {
    const found = await getDb().student.findFirst({
      where: { schoolRegistration, birthDate: new Date(`${body.birthDate}T00:00:00Z`), registrationAllowed: true },
      select: { account: { select: { status: true } } },
    });
    const status = found?.account?.status;
    return Response.json({ result: !found ? 'unmatched' : status === 'active' ? 'created' : status === 'pending' ? 'pending' : 'eligible' });
  } catch {
    return databaseErrorResponse();
  }
}
