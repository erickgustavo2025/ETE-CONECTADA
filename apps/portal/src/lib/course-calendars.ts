import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  CalendarError,
  readCalendarDraft,
  moduleOnDate,
  calendarEnded,
  progressionDecision,
} from './course-calendar-input';
import { uuid } from './sheet-import-input';
type Tx = Prisma.TransactionClient;
const latestCalendar = {
  calendars: { orderBy: { revision: 'desc' as const }, take: 1 },
};
export async function lockCalendarWrites(tx: Tx, actorId: string) {
  if (!uuid.test(actorId))
    throw new CalendarError('Acesso não autorizado.', 403);
  const allowed = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM accounts WHERE id=${actorId}::uuid AND status='active' AND role='secretary' FOR UPDATE`;
  if (!allowed.length) throw new CalendarError('Acesso não autorizado.', 403);
  // Mesmo lock das importações: calendário e planilha não disputam o mesmo vínculo.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
}
async function offerings(tx: Tx, ids?: string[]) {
  const rows = await tx.courseOffering.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    include: latestCalendar,
    orderBy: { id: 'asc' },
    take: 201,
  });
  if (rows.length > 200)
    throw new CalendarError(
      'Há mais de 200 turmas cadastradas. Procure o suporte.',
      409,
    );
  return rows.map((row) => {
    const version = row.calendars[0];
    if (!version)
      throw new CalendarError('Calendário incompleto; solicite revisão.', 409);
    const draft = readCalendarDraft(version.schedule);
    if (draft.courseLabel !== row.courseLabel)
      throw new CalendarError(
        'O curso informado é diferente do curso do calendário.',
        409,
      );
    return { ...row, version, draft };
  });
}
export async function calendarImportState(tx: Tx, scopeIds?: string[]) {
  return offerings(tx, scopeIds);
}
function history(
  row: Prisma.EnrollmentGetPayload<object>,
  actorId: string,
  reason: string,
) {
  return {
    enrollmentId: row.id,
    recordedById: actorId,
    reason,
    mode: row.mode,
    className: row.className,
    grade: row.grade,
    moduleNumber: row.moduleNumber,
    courseLabel: row.courseLabel,
    schoolYear: row.schoolYear,
    periodLabel: row.periodLabel,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    status: row.status,
    reviewedAt: row.reviewedAt,
    offeringId: row.offeringId,
    calendarRevision: row.calendarRevision,
    progressionHeld: row.progressionHeld,
  };
}
// Chamada por operações autenticadas; now só é substituído pelos testes internos.
export async function synchronizeCalendars(
  tx: Tx,
  actorId: string,
  scopeIds?: string[],
  now = new Date(),
) {
  const courses = await offerings(tx, scopeIds);
  const rows = await tx.enrollment.findMany({
    where: {
      mode: 'SUBSEQUENTE',
      status: 'ACTIVE',
      progressionHeld: false,
      offeringId: { in: courses.map((c) => c.id) },
    },
    orderBy: { id: 'asc' },
    take: 10001,
  });
  if (rows.length > 10000)
    throw new CalendarError(
      'Selecione até 100 matrículas por vez para mudar o módulo.',
      409,
    );
  let advanced = 0,
    held = 0,
    updatedDates = 0;
  for (const course of courses) {
    const cohort = rows.filter((row) => row.offeringId === course.id);
    const revisions = [
      ...new Set(
        cohort.flatMap((row) =>
          row.calendarRevision &&
          row.calendarRevision !== course.version.revision
            ? [row.calendarRevision]
            : [],
        ),
      ),
    ];
    const previous = revisions.length
      ? await tx.courseCalendarVersion.findMany({
          where: { offeringId: course.id, revision: { in: revisions } },
        })
      : [];
    const previousDrafts = new Map(
      previous.map((version) => [
        version.revision,
        readCalendarDraft(version.schedule),
      ]),
    );
    const advance = new Set<string>(),
      hold = new Set<string>(),
      refresh = new Set<string>();
    const module = moduleOnDate(course.draft, now);
    for (const row of cohort) {
      if (row.courseLabel !== course.courseLabel)
        throw new CalendarError(
          'O curso da matrícula é diferente do curso desta turma.',
          409,
        );
      const decision = progressionDecision(row, course.draft, now);
      if (decision.kind === 'advance') advance.add(row.id);
      else if (decision.kind === 'hold') hold.add(row.id);
      else if (
        module &&
        module.number === row.calendarModule &&
        row.calendarRevision !== course.version.revision
      ) {
        const old = previousDrafts.get(row.calendarRevision!);
        if (!old)
          throw new CalendarError(
            'O calendário desta turma não foi encontrado. Atualize a página e confira a turma.',
            409,
          );
        if (
          JSON.stringify(old.modules[module.number - 1]) !==
          JSON.stringify(module)
        )
          refresh.add(row.id);
      }
    }
    const changed = cohort.filter(
      (row) => advance.has(row.id) || hold.has(row.id) || refresh.has(row.id),
    );
    if (changed.length)
      await tx.enrollmentImportHistory.createMany({
        data: changed.map((row) =>
          history(
            row,
            actorId,
            advance.has(row.id)
              ? 'CALENDAR_PROGRESSION'
              : hold.has(row.id)
                ? 'CALENDAR_HOLD'
                : 'METADATA_CHANGE',
          ),
        ),
      });
    const update = [...advance, ...refresh];
    if (update.length && module)
      await tx.enrollment.updateMany({
        where: { id: { in: update } },
        data: {
          moduleNumber: module.number,
          calendarModule: module.number,
          calendarRevision: course.version.revision,
          periodLabel: module.periodLabel,
          validFrom: new Date(module.startsOn + 'T00:00:00Z'),
          validUntil: new Date(module.endsOn + 'T00:00:00Z'),
          status: 'UNCONFIRMED',
          reviewedAt: null,
          reviewedById: null,
        },
      });
    if (hold.size)
      await tx.enrollment.updateMany({
        where: { id: { in: [...hold] } },
        data: { progressionHeld: true },
      });
    advanced += advance.size;
    held += hold.size;
    updatedDates += refresh.size;
  }
  return { advanced, held, updatedDates };
}

export async function listCourseOfferings(
  db: PrismaClient,
  actorId: string,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) => {
      await lockCalendarWrites(tx, actorId);
      const changes = await synchronizeCalendars(tx, actorId, undefined, now),
        courses = await offerings(tx);
      const counts = await tx.enrollment.groupBy({
        by: ['offeringId', 'status', 'progressionHeld'],
        where: { offeringId: { in: courses.map((c) => c.id) } },
        _count: { _all: true },
      });
      return {
        changes,
        offerings: courses.map((course) => {
          const current = moduleOnDate(course.draft, now);
          return {
            id: course.id,
            revision: course.version.revision,
            draft: course.draft,
            currentModule: current?.number ?? null,
            ended: calendarEnded(course.draft, now),
            needsUpdatedList:
              !!current &&
              (course.lastImportModule !== current.number ||
                course.lastImportPeriod !== current.periodLabel ||
                !course.lastImportAt ||
                course.lastImportAt.toISOString().slice(0, 10) <
                  current.startsOn),
            lastImportAt: course.lastImportAt?.toISOString() ?? null,
            counts: counts
              .filter((c) => c.offeringId === course.id)
              .reduce(
                (sum, c) => ({
                  total: sum.total + c._count._all,
                  held: sum.held + (c.progressionHeld ? c._count._all : 0),
                  unconfirmed:
                    sum.unconfirmed +
                    (c.status === 'UNCONFIRMED' ? c._count._all : 0),
                }),
                { total: 0, held: 0, unconfirmed: 0 },
              ),
          };
        }),
      };
    },
    { timeout: 60000 },
  );
}
export async function saveCourseCalendar(
  db: PrismaClient,
  actorId: string,
  offeringId: string,
  revision: number,
  value: unknown,
  confirmed: unknown,
) {
  if (
    !uuid.test(offeringId) ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision > 1000000 ||
    confirmed !== true
  )
    throw new CalendarError(
      'Confira as datas do calendário escolar e confirme para salvar.',
    );
  const draft = readCalendarDraft(value);
  return db.$transaction(
    async (tx) => {
      await lockCalendarWrites(tx, actorId);
      const current = (await offerings(tx, [offeringId]))[0];
      if (current) {
        if (current.courseLabel !== draft.courseLabel)
          throw new CalendarError(
            'Não é possível trocar o curso de uma turma já cadastrada. Cadastre outra turma para o novo curso.',
            409,
          );
        if (
          JSON.stringify(current.draft) === JSON.stringify(draft) &&
          (current.version.revision === revision ||
            current.version.revision === revision + 1)
        )
          return { id: offeringId, revision: current.version.revision };
        if (current.version.revision !== revision)
          throw new CalendarError(
            'O calendário mudou; recarregue antes de salvar.',
            409,
          );
        await tx.courseOffering.update({
          where: { id: offeringId },
          data: { label: draft.label },
        });
      } else {
        if (revision !== 0)
          throw new CalendarError(
            'Turma não encontrada. Atualize a lista.',
            409,
          );
        await tx.courseOffering.create({
          data: {
            id: offeringId,
            label: draft.label,
            courseLabel: draft.courseLabel,
          },
        });
      }
      await tx.courseCalendarVersion.create({
        data: {
          offeringId,
          revision: revision + 1,
          schedule: { ...draft, modules: draft.modules.map((m) => ({ ...m })) },
          createdById: actorId,
        },
      });
      return { id: offeringId, revision: revision + 1 };
    },
    { timeout: 30000 },
  );
}
export async function courseMembers(
  db: PrismaClient,
  actorId: string,
  offeringId: string,
  page: number,
) {
  if (
    !uuid.test(offeringId) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 200
  )
    throw new CalendarError('Escolha a turma e confira a página da lista.');
  return db.$transaction(
    async (tx) => {
      await lockCalendarWrites(tx, actorId);
      const course = (await offerings(tx, [offeringId]))[0];
      if (!course) throw new CalendarError('Turma não encontrada.', 404);
      const rows = await tx.enrollment.findMany({
        where: {
          mode: 'SUBSEQUENTE',
          courseLabel: course.courseLabel,
          OR: [
            { offeringId },
            {
              offeringId: null,
              OR: [
                { schoolImportKey: null },
                { schoolImportKey: { startsWith: `school:${offeringId}:` } },
              ],
            },
          ],
        },
        select: {
          id: true,
          className: true,
          moduleNumber: true,
          status: true,
          progressionHeld: true,
          offeringId: true,
          student: { select: { fullName: true, schoolRegistration: true } },
        },
        orderBy: { id: 'asc' },
        skip: page * 50,
        take: 51,
      });
      return { members: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    { timeout: 30000 },
  );
}
export async function setCourseProgression(
  db: PrismaClient,
  actorId: string,
  offeringId: string,
  revision: number,
  enrollmentIds: unknown,
  hold: unknown,
  confirmed: unknown,
  now = new Date(),
) {
  if (
    !uuid.test(offeringId) ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    typeof hold !== 'boolean' ||
    confirmed !== true ||
    !Array.isArray(enrollmentIds) ||
    !enrollmentIds.length ||
    enrollmentIds.length > 100 ||
    enrollmentIds.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
    new Set(enrollmentIds).size !== enrollmentIds.length
  )
    throw new CalendarError(
      'Selecione até 100 matrículas e confirme a mudança automática de módulo.',
    );
  return db.$transaction(
    async (tx) => {
      await lockCalendarWrites(tx, actorId);
      const course = (await offerings(tx, [offeringId]))[0];
      if (!course || course.version.revision !== revision)
        throw new CalendarError(
          'Os dados da turma ou do calendário mudaram. Atualize a lista e confira novamente.',
          409,
        );
      const rows = await tx.enrollment.findMany({
        where: { id: { in: enrollmentIds } },
      });
      if (rows.length !== enrollmentIds.length)
        throw new CalendarError('Vínculo não encontrado.', 409);
      const current = moduleOnDate(course.draft, now);
      for (const row of rows) {
        if (
          row.mode !== 'SUBSEQUENTE' ||
          row.courseLabel !== course.courseLabel ||
          row.status === 'ENDED' ||
          !row.moduleNumber ||
          row.moduleNumber > course.draft.modules.length ||
          (row.offeringId && row.offeringId !== offeringId) ||
          (row.schoolImportKey &&
            !row.schoolImportKey.startsWith(`school:${offeringId}:`))
        )
          throw new CalendarError(
            'Confira o curso, a turma, a situação e o módulo das matrículas selecionadas.',
            409,
          );
        if (!hold && (!current || row.moduleNumber !== current.number))
          throw new CalendarError(
            'O módulo do aluno é diferente do calendário. Mantenha a mudança automática pausada até conferir o registro escolar.',
            409,
          );
      }
      let updated = 0;
      for (const row of rows) {
        if (
          row.offeringId === offeringId &&
          row.progressionHeld === hold &&
          row.calendarModule === row.moduleNumber &&
          row.calendarRevision === revision
        )
          continue;
        await tx.enrollmentImportHistory.create({
          data: history(
            row,
            actorId,
            row.offeringId ? 'CALENDAR_HOLD' : 'CALENDAR_BINDING',
          ),
        });
        await tx.enrollment.update({
          where: { id: row.id },
          data: {
            offeringId,
            calendarRevision: revision,
            calendarModule: row.moduleNumber,
            progressionHeld: hold,
          },
        });
        updated++;
      }
      return { updated };
    },
    { timeout: 30000 },
  );
}
