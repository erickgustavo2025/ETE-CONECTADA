import type { Prisma } from '../generated/prisma/client';
import { SheetImportError, type SheetInput } from './sheet-import-input';
import { academicVersion } from './school-academic-administration';
import {
  academicInclude,
  recordAcademicChange,
  type AcademicPatch,
} from './school-academic';
import { calendarDay, readCalendarDraft } from './course-calendar-input';
type Tx = Prisma.TransactionClient;
const invalid = () =>
  new SheetImportError(
    'A situação de um repetente ou a turma escolhida mudou. Confira a seleção e gere outra prévia.',
    409,
  );
export async function prepareRepeaterPlacements(tx: Tx, input: SheetInput) {
  const selections = input.repeaters ?? [];
  if (!selections.length) return [];
  const rows = await tx.enrollment.findMany({
    where: { id: { in: selections.map((s) => s.enrollmentId) } },
    include: {
      ...academicInclude,
      student: {
        select: {
          id: true,
          fullName: true,
          schoolRegistration: true,
          accessRevision: true,
          loginBlocked: true,
          issuanceBlocked: true,
          account: { select: { id: true, role: true, status: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  const seen = new Set<string>();
  const result = [];
  for (const selection of selections) {
    const row = rows.find((r) => r.id === selection.enrollmentId);
    const target = input.contexts.find(
      (c) => c.sheetName === selection.sheetName,
    );
    if (
      !row ||
      !target?.header ||
      seen.has(row.studentId) ||
      row.status !== 'ACTIVE' ||
      !row.reviewedAt ||
      !row.repetitionPending ||
      !row.student.schoolRegistration ||
      (row.student.account && row.student.account.role !== 'student') ||
      academicVersion(row) !== selection.version ||
      row.mode !== input.mode ||
      row.courseLabel !== target.courseLabel ||
      (row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber) !==
        target.stage ||
      !row.periodLabel ||
      row.periodLabel >= target.periodLabel ||
      input.rows.some(
        (r) =>
          r.schoolRegistration === row.student.schoolRegistration &&
          r.context.sheetName !== target.sheetName,
      )
    )
      throw invalid();
    seen.add(row.studentId);
    const previous = await tx.schoolAcademicEvent.findFirst({
      where: { enrollmentId: row.id, kind: 'REPEAT' },
      orderBy: { revision: 'desc' },
      select: { id: true, beforeState: true },
    });
    if (!previous) throw invalid();
    const sourceCalendar =
      row.mode === 'SUBSEQUENTE' && row.offeringId && row.calendarRevision
        ? await tx.courseCalendarVersion.findUnique({
            where: {
              offeringId_revision: {
                offeringId: row.offeringId,
                revision: row.calendarRevision,
              },
            },
            select: { schedule: true },
          })
        : null;
    const originalStart =
      row.entryStartedOn?.toISOString().slice(0, 10) ??
      (row.mode === 'SUBSEQUENTE'
        ? sourceCalendar
          ? readCalendarDraft(sourceCalendar.schedule).startsOn
          : null
        : row.validFrom?.toISOString().slice(0, 10));
    if (!originalStart || !row.validFrom) throw invalid();
    result.push({ row, target, previous, originalStart });
  }
  return result;
}
export type RepeaterPlacement = Awaited<
  ReturnType<typeof prepareRepeaterPlacements>
>[number];
export function repeaterPlacementView(p: RepeaterPlacement, input: SheetInput) {
  return {
    enrollmentId: p.row.id,
    fullName: p.row.student.fullName,
    schoolRegistration: p.row.student.schoolRegistration!,
    fromClass: p.row.className,
    fromPeriod: p.row.periodLabel,
    toClass: p.target.className,
    toPeriod: p.target.periodLabel,
    stage: p.target.stage,
    inFile: input.rows.some(
      (r) => r.schoolRegistration === p.row.student.schoolRegistration,
    ),
  };
}
export async function applyRepeaterPlacement(
  tx: Tx,
  p: RepeaterPlacement,
  target:
    | {
        id: string;
        version: { revision: number };
        draft: ReturnType<typeof readCalendarDraft>;
      }
    | undefined,
  actorId: string,
  operationKey: string,
) {
  const before = p.previous.beforeState as Record<string, unknown>;
  const row = await tx.enrollment.findUniqueOrThrow({
    where: { id: p.row.id },
  });
  const patch: AcademicPatch = {
    className: p.target.className,
    periodLabel: p.target.periodLabel,
    schoolYear: p.target.header!.schoolYear,
    schoolImportKey: `school:${p.target.scopeId}:${p.row.student.schoolRegistration}`,
    repetitionPending: false,
    repetitionOverride: false,
    nextClassName: null,
    progressionHeld:
      row.status !== 'ACTIVE' ||
      !row.reviewedAt ||
      before.progressionHeld !== false,
    entryStartedOn: new Date(p.originalStart),
  };
  if (row.mode === 'SUBSEQUENTE') {
    const module = target?.draft.modules[p.target.stage - 1];
    if (
      !target ||
      target.draft.courseLabel !== row.courseLabel ||
      !module ||
      module.number !== row.moduleNumber ||
      module.periodLabel !== p.target.periodLabel
    )
      throw invalid();
    patch.offeringId = target.id;
    patch.calendarRevision = target.version.revision;
    patch.calendarModule = module.number;
    patch.validFrom = new Date(module.startsOn);
    patch.validUntil = new Date(module.endsOn);
  } else {
    patch.validFrom = new Date(`${p.target.header!.schoolYear}-02-01`);
    patch.validUntil = new Date(`${p.target.header!.schoolYear}-12-31`);
  }
  if (!patch.validFrom || !row.validFrom || patch.validFrom <= row.validFrom)
    throw invalid();
  const key = patch.schoolImportKey!;
  const collision = await tx.enrollment.findUnique({
    where: { schoolImportKey: key },
    select: { id: true },
  });
  if (collision && collision.id !== row.id) throw invalid();
  await recordAcademicChange(tx, row, patch, {
    kind: 'TRANSFER',
    actorId,
    operationKey,
    effectiveOn: calendarDay(new Date()),
    reason: `Enturmação confirmada em ${p.target.className}, período ${p.target.periodLabel}, sem mudança de etapa.`,
  });
}
export async function repeaterCandidates(
  tx: Tx,
  input: SheetInput,
  sheetName: unknown,
  page: unknown,
) {
  const target = input.contexts.find(
    (c) => c.sheetName === sheetName && c.header,
  );
  if (
    !target ||
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw new SheetImportError(
      'Confira a turma e a página dos repetentes.',
      400,
    );
  const rows = await tx.enrollment.findMany({
    where: {
      mode: input.mode,
      courseLabel: target.courseLabel,
      ...(input.mode === 'INTEGRADO'
        ? { grade: target.stage }
        : { moduleNumber: target.stage }),
      status: 'ACTIVE',
      reviewedAt: { not: null },
      repetitionPending: true,
      periodLabel: { lt: target.periodLabel },
      student: {
        schoolRegistration: { not: null },
        OR: [
          { account: { is: null } },
          { account: { is: { role: 'student' } } },
        ],
      },
    },
    orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }],
    skip: (page - 1) * 20,
    take: 21,
    include: {
      student: { select: { fullName: true, schoolRegistration: true } },
    },
  });
  return {
    page,
    hasNext: rows.length > 20,
    candidates: rows.slice(0, 20).map((r) => ({
      enrollmentId: r.id,
      version: academicVersion(r),
      fullName: r.student.fullName,
      schoolRegistration: r.student.schoolRegistration!,
      className: r.className,
      periodLabel: r.periodLabel,
    })),
  };
}
