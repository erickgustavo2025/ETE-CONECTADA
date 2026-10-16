import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { readAccessBody } from '@/lib/access-input';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
import { CalendarError } from '@/lib/course-calendar-input';
import {
  listCourseOfferings,
  saveCourseCalendar,
  courseMembers,
  setCourseProgression,
} from '@/lib/course-calendars';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return json({ error: 'Origem não autorizada.' }, 403);
  try {
    const session = await currentSession();
    if (!session)
      return json({ error: 'Entre novamente para continuar.' }, 401);
    if (session.role !== 'secretary')
      return json({ error: 'Acesso exclusivo da secretaria.' }, 403);
    const input = await readAccessBody(request);
    if ('response' in input) return input.response;
    const body = input.body;
    const fields: Record<string, string[]> = {
      list: ['action'],
      save: ['action', 'offeringId', 'revision', 'draft', 'confirmed'],
      members: ['action', 'offeringId', 'page'],
      policy: [
        'action',
        'offeringId',
        'revision',
        'enrollmentIds',
        'hold',
        'confirmed',
      ],
    };
    if (
      typeof body.action !== 'string' ||
      !Object.hasOwn(fields, body.action) ||
      Object.keys(body).some(
        (key) => !fields[body.action as string].includes(key),
      )
    )
      throw new CalendarError('Confira a ação e os campos do calendário.');
    if (body.action === 'list')
      return json(await listCourseOfferings(getDb(), session.accountId));
    if (typeof body.offeringId !== 'string')
      throw new CalendarError('Selecione a oferta.');
    if (body.action === 'members') {
      if (typeof body.page !== 'number')
        throw new CalendarError('Confira a página.');
      return json(
        await courseMembers(
          getDb(),
          session.accountId,
          body.offeringId,
          body.page,
        ),
      );
    }
    if (typeof body.revision !== 'number')
      throw new CalendarError('Recarregue o calendário antes de continuar.');
    if (body.action === 'save')
      return json(
        await saveCourseCalendar(
          getDb(),
          session.accountId,
          body.offeringId,
          body.revision,
          body.draft,
          body.confirmed,
        ),
      );
    return json(
      await setCourseProgression(
        getDb(),
        session.accountId,
        body.offeringId,
        body.revision,
        body.enrollmentIds,
        body.hold,
        body.confirmed,
      ),
    );
  } catch (error) {
    if (error instanceof CalendarError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          'Não foi possível concluir. Recarregue para conferir o estado do calendário e tente novamente.',
      },
      409,
    );
  }
}
