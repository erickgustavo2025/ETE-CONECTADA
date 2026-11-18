import type { Enrollment, Prisma } from '../generated/prisma/client';
import { getDb } from './db';
import { RequestError } from './request-error';
import { declarationPortalEnabled } from './declaration-documents';
import {
  readCalendarDraft,
  calendarDay,
  CalendarError,
} from './course-calendar-input';
import {
  automaticPromotionDecision,
  dayBeforePromotion,
  SchoolPromotionError,
} from './school-promotion-input';

export const academicInclude = {
  offering: {
    include: { calendars: { orderBy: { revision: 'desc' as const }, take: 1 } },
  },
} as const;
type Tx = Prisma.TransactionClient;
type AcademicRow = Prisma.EnrollmentGetPayload<{
  include: typeof academicInclude;
}>;
export type AcademicPatch = Partial<
  Pick<
    Enrollment,
    | 'className'
    | 'grade'
    | 'moduleNumber'
    | 'periodLabel'
    | 'schoolYear'
    | 'validFrom'
    | 'validUntil'
    | 'status'
    | 'reviewedAt'
    | 'reviewedById'
    | 'progressionHeld'
    | 'repetitionPending'
    | 'repetitionOverride'
    | 'entryStartedOn'
    | 'schoolImportKey'
    | 'nextClassName'
    | 'offeringId'
    | 'calendarModule'
    | 'calendarRevision'
  >
>;
const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
export function academicSnapshot(row: Enrollment) {
  return {
    className: row.className,
    mode: row.mode,
    courseLabel: row.courseLabel,
    grade: row.grade,
    moduleNumber: row.moduleNumber,
    schoolYear: row.schoolYear,
    periodLabel: row.periodLabel,
    status: row.status,
    validFrom: day(row.validFrom),
    validUntil: day(row.validUntil),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedById: row.reviewedById,
    progressionHeld: row.progressionHeld,
    repetitionPending: row.repetitionPending,
    repetitionOverride: row.repetitionOverride,
    entryStartedOn: day(row.entryStartedOn),
    nextClassName: row.nextClassName,
    schoolImportKey: row.schoolImportKey,
    offeringId: row.offeringId,
    calendarModule: row.calendarModule,
    calendarRevision: row.calendarRevision,
    academicRevision: row.academicRevision,
  };
}
// Chamador deve autorizar e travar a matrícula. Sem fonte de dados do cliente aqui.
export async function recordAcademicChange(
  tx: Tx,
  row: Enrollment,
  patch: AcademicPatch,
  event: {
    kind: string;
    actorId: string | null;
    operationKey: string;
    effectiveOn: string;
    reason: string;
    requestHash?: string;
    actorName?: string;
    completion?: boolean;
    correctsEventId?: string;
  },
) {
  const updated = await tx.enrollment.update({
    where: { id: row.id, academicRevision: row.academicRevision },
    data: { ...patch, academicRevision: { increment: 1 } },
  });
  await tx.schoolAcademicEvent.create({
    data: {
      enrollmentId: row.id,
      actorId: event.actorId,
      operationKey: event.operationKey,
      kind: event.kind,
      revision: updated.academicRevision,
      beforeState: academicSnapshot(row),
      afterState: {
        ...academicSnapshot(updated),
        ...(event.requestHash ? { requestHash: event.requestHash } : {}),
        ...(event.actorName ? { actorLabel: event.actorName } : {}),
        ...(event.completion ? { completion: true } : {}),
        ...(event.correctsEventId
          ? { correctsEventId: event.correctsEventId }
          : {}),
      },
      effectiveOn: new Date(event.effectiveOn + 'T00:00:00Z'),
      reason: event.reason,
    },
  });
  return updated;
}
function nextClassName(name: string, stage: number, target: number) {
  const patterns = [
    /^(ST(?:DSIN|ADMN|ENFN))([1-4])([A-Z-]*)$/,
    /^(T(?:DS|ADM))([1-3])(IN-[A-Z])$/,
    /^()([1-3])((?:TDS|TADM)IN-[A-Z])$/,
    /^()([1-3])([ABU] (?:DS|ADM))$/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(name);
    if (m && Number(m[2]) === stage) return `${m[1]}${target}${m[3]}`;
  }
  return null;
}
function progressionPatch(
  row: AcademicRow,
  next: ReturnType<typeof import('./school-promotion-input').nextAcademicStage>,
): AcademicPatch | null {
  const className =
    row.nextClassName ??
    nextClassName(
      row.className,
      row.mode === 'INTEGRADO' ? row.grade! : row.moduleNumber!,
      next.stage,
    );
  if (!className) return null;
  const common = {
    className,
    schoolYear: next.schoolYear,
    periodLabel: next.periodLabel,
    nextClassName: null,
  };
  if (row.mode === 'INTEGRADO')
    return {
      ...common,
      grade: next.stage,
      validFrom: new Date(next.effectiveOn),
      validUntil: new Date(`${next.schoolYear}-12-31`),
    };
  const version = row.offering?.calendars[0];
  if (
    !version ||
    row.calendarRevision !== version.revision ||
    row.calendarModule !== row.moduleNumber ||
    row.offering?.courseLabel !== row.courseLabel
  )
    return null;
  const schedule = readCalendarDraft(version.schedule),
    module = schedule.modules[next.stage - 1];
  if (
    !module ||
    module.startsOn !== next.effectiveOn ||
    module.periodLabel !== next.periodLabel
  )
    return null;
  return {
    ...common,
    moduleNumber: next.stage,
    calendarModule: next.stage,
    validFrom: new Date(module.startsOn),
    validUntil: new Date(module.endsOn),
    entryStartedOn: row.entryStartedOn ?? new Date(schedule.startsOn),
  };
}

// Executado somente sob a trava acadêmica comum às importações e à emissão.
// Uma visita pode aplicar operações vencidas; effectiveOn conserva a data escolar.
export async function applyStudentAcademicProgression(
  tx: Tx,
  studentId: string,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM enrollments WHERE student_id=${studentId}::uuid AND status='ACTIVE' ORDER BY id FOR UPDATE`;
  const rows = await tx.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: academicInclude,
    orderBy: { id: 'asc' },
    take: 11,
  });
  if (rows.length > 10)
    throw new RequestError(
      'Há muitas matrículas ativas. Procure a secretaria para conferir.',
      409,
    );
  const result = { advanced: 0, continued: 0, needsReview: [] as string[] };
  for (const initial of rows) {
    let row = initial;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!row.validFrom || !row.validUntil || !row.periodLabel) break;
      if (!['ADM', 'DS', 'ENF'].includes(row.courseLabel)) break;
      const source = {
        mode: row.mode,
        courseLabel: row.courseLabel as 'ADM' | 'DS' | 'ENF',
        stage: (row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber) ?? 0,
        periodLabel: row.periodLabel,
        status: row.status,
        reviewedAt: row.reviewedAt,
        repetitionPending: row.repetitionPending,
        progressionHeld: row.progressionHeld,
      };
      if (day(row.validFrom)! > calendarDay(now)) break;
      let decision;
      try {
        decision = automaticPromotionDecision(source, now);
      } catch (error) {
        if (!(error instanceof SchoolPromotionError)) throw error;
        result.needsReview.push(row.id);
        break;
      }
      if (decision.kind === 'blocked' || decision.kind === 'final-stage') break;
      const next = decision.next,
        periodEnd = `${row.periodLabel.slice(0, 4)}-${row.mode === 'SUBSEQUENTE' && row.periodLabel.endsWith('.1') ? '07-31' : '12-31'}`,
        until = dayBeforePromotion(next.effectiveOn);
      // Uma vigência excepcional conferida não é substituída pela regra padrão.
      if (![periodEnd, until].includes(day(row.validUntil)!)) break;
      let patch;
      try {
        patch = progressionPatch(row, next);
      } catch (error) {
        if (!(error instanceof CalendarError)) throw error;
        result.needsReview.push(row.id);
        break;
      }
      if (!patch) {
        result.needsReview.push(row.id);
        break;
      }
      if (decision.kind === 'wait') {
        if (day(row.validUntil) === periodEnd && until > periodEnd) {
          await recordAcademicChange(
            tx,
            row,
            {
              validUntil: new Date(until),
              entryStartedOn: patch.entryStartedOn ?? row.entryStartedOn,
            },
            {
              kind: 'CONTINUITY',
              actorId: null,
              operationKey: `auto:${row.id}:${row.academicRevision}:continuity`,
              effectiveOn: periodEnd,
              reason: 'Vínculo mantido na etapa atual até o início da próxima.',
            },
          );
          result.continued++;
        }
        break;
      }
      await recordAcademicChange(tx, row, patch, {
        kind: 'PROGRESSION',
        actorId: null,
        operationKey: `auto:${row.id}:${row.academicRevision}:${next.periodLabel}`,
        effectiveOn: next.effectiveOn,
        reason: 'Passagem automática na data de início da próxima etapa.',
      });
      result.advanced++;
      row = await tx.enrollment.findUniqueOrThrow({
        where: { id: row.id },
        include: academicInclude,
      });
    }
  }
  return result;
}
export async function synchronizeOwnAcademicState(accountId: string) {
  if (!declarationPortalEnabled()) return;
  return getDb().$transaction(
    async (tx) => {
      const [actor] = await tx.$queryRaw<
        Array<{ studentId: string }>
      >`SELECT student_id AS "studentId" FROM accounts WHERE id=${accountId}::uuid AND role='student' AND status='active' FOR UPDATE`;
      if (!actor) throw new RequestError('Entre com sua conta de aluno.', 403);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
      const [student] = await tx.$queryRaw<
        Array<{ blocked: boolean }>
      >`SELECT login_blocked AS blocked FROM students WHERE id=${actor.studentId}::uuid FOR UPDATE`;
      if (!student || student.blocked)
        throw new RequestError(
          'Seu acesso está bloqueado. Procure a secretaria.',
          403,
        );
      return applyStudentAcademicProgression(tx, actor.studentId);
    },
    { maxWait: 5000, timeout: 15000 },
  );
}

// Regra compartilhada pelas novas demandas acadêmicas, com login separado.
export async function requireAcademicRequestAccess(
  tx: Pick<Tx, 'enrollment'>,
  studentId: string,
) {
  const waiting = await tx.enrollment.count({
    where: {
      studentId,
      status: { not: 'ENDED' },
      repetitionPending: true,
      repetitionOverride: false,
    },
  });
  if (waiting)
    throw new RequestError(
      'Você está aguardando uma nova turma. Procure a secretaria para conferir sua situação.',
      403,
    );
}
