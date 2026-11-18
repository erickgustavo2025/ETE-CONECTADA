import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { declarationRegistryPreviewEnabled } from './declaration-documents';
import { RequestError } from './request-error';
import { digest, uuid } from './sheet-import-input';
import { calendarDay, readCalendarDraft } from './course-calendar-input';
import { academicInclude, recordAcademicChange } from './school-academic';
import { academicVersion } from './school-academic-administration';
import {
  readCompletionInput,
  type CompletionContext,
} from './school-completion-input';
const sourceInclude = {
  ...academicInclude,
  student: {
    select: {
      id: true,
      fullName: true,
      schoolRegistration: true,
      account: { select: { role: true, status: true } },
    },
  },
} as const;
type Source = Prisma.EnrollmentGetPayload<{ include: typeof sourceInclude }>;
function eligible(row: Source, context: CompletionContext, now: Date) {
  if (
    row.mode !== context.mode ||
    row.courseLabel !== context.courseLabel ||
    row.className !== context.className ||
    row.periodLabel !== context.periodLabel ||
    row.status !== 'ACTIVE' ||
    !row.reviewedAt ||
    row.repetitionPending ||
    (row.student.account && row.student.account.role !== 'student') ||
    !row.validFrom ||
    !row.validUntil ||
    row.validFrom > row.validUntil ||
    row.validFrom.toISOString().slice(0, 10) > calendarDay(now)
  )
    return false;
  const stage = context.mode === 'INTEGRADO' ? row.grade : row.moduleNumber;
  if (
    stage !==
    (context.mode === 'SUBSEQUENTE' && context.courseLabel === 'ENF' ? 4 : 3)
  )
    return false;
  if (context.mode === 'INTEGRADO') return true;
  const v = row.offering?.calendars[0];
  if (
    !v ||
    v.revision !== row.calendarRevision ||
    row.offering?.courseLabel !== context.courseLabel ||
    row.calendarModule !== row.moduleNumber
  )
    return false;
  try {
    const draft = readCalendarDraft(v.schedule),
      module = draft.modules[stage - 1];
    return (
      !!module &&
      draft.courseLabel === context.courseLabel &&
      module.periodLabel === row.periodLabel &&
      module.startsOn === row.validFrom.toISOString().slice(0, 10) &&
      module.endsOn === row.validUntil.toISOString().slice(0, 10)
    );
  } catch {
    return false;
  }
}
function studentView(row: Source) {
  return {
    enrollmentId: row.id,
    version: academicVersion(row),
    name: row.student.fullName ?? 'Nome não informado',
    registration: row.student.schoolRegistration,
    stage: row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber,
  };
}
export type CompletionStudent = ReturnType<typeof studentView> & {
  selectable?: boolean;
};
export type CompletionResult =
  | { students: CompletionStudent[]; page: number; hasNext: boolean }
  | { students: CompletionStudent[]; previewVersion: string }
  | { ended: number; replayed: boolean };
export async function completeSchoolEnrollments(
  db: PrismaClient,
  actorId: string,
  value: unknown,
  now = new Date(),
): Promise<CompletionResult> {
  if (!declarationRegistryPreviewEnabled())
    throw new RequestError('Página não disponível.', 404);
  const input = readCompletionInput(value);
  if (!uuid.test(actorId))
    throw new RequestError(
      'Somente a secretaria pode confirmar a conclusão.',
      403,
    );
  return db.$transaction(
    async (tx) => {
      const [actor] = await tx.$queryRaw<
        Array<{ id: string; name: string | null }>
      >`SELECT a.id,s.full_name AS name FROM accounts a JOIN students s ON s.id=a.student_id WHERE a.id=${actorId}::uuid AND a.role='secretary' AND a.status='active' AND NOT s.login_blocked FOR SHARE OF a`;
      if (!actor)
        throw new RequestError(
          'Somente a secretaria pode confirmar a conclusão.',
          403,
        );
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
      const context = input.context;
      if (input.operation === 'candidates') {
        const rows = await tx.enrollment.findMany({
          where: {
            ...context,
            status: 'ACTIVE',
            reviewedAt: { not: null },
            repetitionPending: false,
            ...(context.mode === 'INTEGRADO'
              ? { grade: 3 }
              : { moduleNumber: context.courseLabel === 'ENF' ? 4 : 3 }),
            student: {
              OR: [
                { account: { is: null } },
                { account: { is: { role: 'student' } } },
              ],
            },
          },
          include: sourceInclude,
          orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }],
          take: 21,
          skip: (input.page - 1) * 20,
        });
        return {
          students: rows.slice(0, 20).map((r) => ({
            ...studentView(r),
            selectable: eligible(r, context, now),
          })),
          page: input.page,
          hasNext: rows.length > 20,
        };
      }
      const requestHash = digest({
        actorId,
        context,
        selections: input.selections,
        reason: input.reason,
      });
      let prefix = '';
      if (input.operation === 'confirm') {
        prefix = `complete:${actorId}:${input.requestKey}:`;
        const previous = await tx.schoolAcademicEvent.findMany({
          where: { operationKey: { startsWith: prefix } },
          take: 101,
        });
        if (previous.length) {
          if (
            previous.length !== input.selections.length ||
            previous.some(
              (e) =>
                e.kind !== 'END' ||
                !input.selections.some(
                  (s) => s.enrollmentId === e.enrollmentId,
                ) ||
                (e.afterState as Record<string, unknown>).requestHash !==
                  requestHash,
            )
          )
            throw new RequestError(
              'Esta tentativa já foi usada para outra operação. Consulte a turma.',
              409,
            );
          return { ended: previous.length, replayed: true };
        }
      }
      const rows = await tx.enrollment.findMany({
        where: { id: { in: input.selections.map((s) => s.enrollmentId) } },
        include: sourceInclude,
        orderBy: { id: 'asc' },
      });
      if (
        rows.length !== input.selections.length ||
        rows.some(
          (r) =>
            academicVersion(r) !==
              input.selections.find((s) => s.enrollmentId === r.id)?.version ||
            !eligible(r, context, now),
        )
      )
        throw new RequestError(
          'A situação de um aluno ou a turma mudou. Consulte novamente os concluintes.',
          409,
        );
      const previewVersion = digest({ requestHash, rows });
      if (input.operation === 'preview')
        return { students: rows.map(studentView), previewVersion };
      if (input.previewVersion !== previewVersion)
        throw new RequestError(
          'Os dados da prévia mudaram. Consulte e confira novamente.',
          409,
        );
      for (const row of rows)
        await recordAcademicChange(
          tx,
          row,
          {
            status: 'ENDED',
            progressionHeld: true,
            repetitionOverride: false,
            nextClassName: null,
          },
          {
            kind: 'END',
            actorId,
            actorName: actor.name ?? 'Responsável da secretaria',
            requestHash,
            completion: true,
            operationKey: prefix + row.id,
            effectiveOn: calendarDay(now),
            reason: input.reason,
          },
        );
      return { ended: rows.length, replayed: false };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}
