import {
  requireCurrentEnrollment,
  EnrollmentValidityError,
} from './enrollment-validity';
import { subsequentContext, DeclarationValidationError } from './declarations';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { getDb } from './db';
import { RequestError } from './request-error';
import { declarationPortalEnabled } from './declaration-documents';
import {
  academicInclude,
  academicSnapshot,
  applyStudentAcademicProgression,
  recordAcademicChange,
  type AcademicPatch,
} from './school-academic';
import {
  readAcademicAdminInput,
  type AcademicAdminInput,
} from './school-academic-input';
import type { AcademicDetail } from './school-academic-types';
import {
  automaticPromotionDecision,
  nextAcademicStage,
} from './school-promotion-input';
import { calendarDay } from './course-calendar-input';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const academicVersion = (row: Parameters<typeof academicSnapshot>[0]) =>
  hash(academicSnapshot(row));
const date = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function consistentClosure(
  row: Parameters<typeof academicSnapshot>[0],
  event: { revision: number; afterState: Prisma.JsonValue } | null,
) {
  if (
    !event ||
    event.revision !== row.academicRevision ||
    row.status !== 'ENDED'
  )
    return false;
  const after = object(event.afterState);
  return (
    after.completion === true &&
    Object.entries(academicSnapshot(row)).every(
      ([key, value]) => after[key] === value,
    )
  );
}
export async function manageAcademicEnrollment(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: AcademicAdminInput,
  now = new Date(),
): Promise<AcademicDetail> {
  const [actor] = await tx.$queryRaw<
    Array<{ id: string; name: string | null }>
  >`SELECT a.id,s.full_name AS name FROM accounts a JOIN students s ON s.id=a.student_id WHERE a.id=${actorId}::uuid AND a.role='secretary' AND a.status='active' AND NOT s.login_blocked FOR SHARE OF a`;
  if (!actor)
    throw new RequestError(
      'Somente a secretaria pode alterar a situação escolar.',
      403,
    );
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
  const [target] = await tx.$queryRaw<
    Array<{ studentId: string }>
  >`SELECT e.student_id AS "studentId" FROM enrollments e LEFT JOIN accounts a ON a.student_id=e.student_id WHERE e.id=${input.enrollmentId}::uuid AND (a.id IS NULL OR a.role='student') FOR UPDATE OF e`;
  if (!target)
    throw new RequestError('Matrícula de aluno não encontrada.', 404);
  await applyStudentAcademicProgression(tx, target.studentId, now);
  let row = await tx.enrollment.findUniqueOrThrow({
    where: { id: input.enrollmentId },
    include: academicInclude,
  });
  let created: boolean | undefined;
  if (input.operation === 'change') {
    const operationKey = `staff:${actorId}:${input.requestKey}`,
      requestHash = hash(input);
    const old = await tx.schoolAcademicEvent.findUnique({
      where: { operationKey },
    });
    if (old) {
      if (
        old.enrollmentId !== row.id ||
        object(old.afterState).requestHash !== requestHash
      )
        throw new RequestError(
          'Esta tentativa já foi usada para outra alteração. Atualize a matrícula.',
          409,
        );
      created = false;
    } else {
      if (input.version !== academicVersion(row))
        throw new RequestError(
          'A situação escolar mudou. Consulte novamente antes de confirmar.',
          409,
        );
      if (row.status === 'ENDED' && input.action !== 'REOPEN')
        throw new RequestError(
          'Esta matrícula está encerrada. Confira o vínculo antes de alterar.',
          409,
        );
      let patch: AcademicPatch;
      let correctedEventId: string | undefined;
      if (input.action === 'REOPEN') {
        const closure = await tx.schoolAcademicEvent.findFirst({
          where: { enrollmentId: row.id, kind: 'END' },
          orderBy: { revision: 'desc' },
        });
        if (!consistentClosure(row, closure))
          throw new RequestError(
            'Não há encerramento por conclusão compatível para corrigir. Consulte a situação atual.',
            409,
          );
        correctedEventId = closure!.id;
        patch = {
          status: 'UNCONFIRMED',
          reviewedAt: null,
          reviewedById: null,
          progressionHeld: true,
          repetitionOverride: false,
          nextClassName: null,
        };
      } else if (input.action === 'ENABLE') {
        if (
          row.repetitionPending ||
          !row.periodLabel ||
          !row.validFrom ||
          !row.validUntil ||
          row.validFrom > row.validUntil
        )
          throw new RequestError(
            'Confira a matrícula e as datas antes de ativar a passagem automática.',
            422,
          );
        if (!['ADM', 'DS', 'ENF'].includes(row.courseLabel))
          throw new RequestError('Confira o curso da matrícula.', 422);
        if (
          row.mode === 'SUBSEQUENTE' &&
          (!row.offering ||
            row.offering.calendars[0]?.revision !== row.calendarRevision ||
            row.calendarModule !== row.moduleNumber)
        )
          throw new RequestError(
            'Leia a planilha atualizada e confira os dados desta turma.',
            422,
          );
        try {
          automaticPromotionDecision(
            {
              mode: row.mode,
              courseLabel: row.courseLabel as 'ADM' | 'DS' | 'ENF',
              stage:
                (row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber) ?? 0,
              periodLabel: row.periodLabel,
              status: 'ACTIVE',
              reviewedAt: now,
              repetitionPending: false,
              progressionHeld: false,
            },
            now,
          );
        } catch {
          throw new RequestError(
            'Confira o ano, o módulo e o período da matrícula.',
            422,
          );
        }
        patch = {
          status: 'ACTIVE',
          reviewedAt: now,
          reviewedById: actorId,
          progressionHeld: false,
          nextClassName: input.nextClassName,
        };
      } else if (
        input.action === 'REPEAT' ||
        input.action === 'REPEAT_PREVIOUS'
      ) {
        if (row.status !== 'ACTIVE' || row.repetitionPending)
          throw new RequestError(
            'Confira a situação atual antes de marcar repetência.',
            409,
          );
        patch = {
          repetitionPending: true,
          repetitionOverride: false,
          progressionHeld: true,
        };
        if (input.action === 'REPEAT_PREVIOUS') {
          const previous = await tx.schoolAcademicEvent.findFirst({
            where: { enrollmentId: row.id, kind: 'PROGRESSION' },
            orderBy: { revision: 'desc' },
          });
          const before = object(previous?.beforeState),
            after = object(previous?.afterState);
          if (
            !previous ||
            after.className !== row.className ||
            after.periodLabel !== row.periodLabel ||
            after.grade !== row.grade ||
            after.moduleNumber !== row.moduleNumber ||
            after.offeringId !== row.offeringId
          )
            throw new RequestError(
              'Não há passagem anterior compatível para corrigir. Confira o histórico.',
              409,
            );
          const parse = (key: string) =>
            typeof before[key] === 'string'
              ? new Date(before[key] as string)
              : null;
          patch = {
            ...patch,
            className: String(before.className),
            grade: typeof before.grade === 'number' ? before.grade : null,
            moduleNumber:
              typeof before.moduleNumber === 'number'
                ? before.moduleNumber
                : null,
            calendarModule:
              typeof before.calendarModule === 'number'
                ? before.calendarModule
                : null,
            periodLabel: String(before.periodLabel),
            schoolYear:
              typeof before.schoolYear === 'number' ? before.schoolYear : null,
            validFrom: parse('validFrom'),
            validUntil: parse('validUntil'),
          };
        }
      } else if (
        input.action === 'ALLOW_REQUESTS' ||
        input.action === 'WAIT_REQUESTS'
      ) {
        if (
          !row.repetitionPending ||
          row.repetitionOverride === (input.action === 'ALLOW_REQUESTS')
        )
          throw new RequestError(
            'Consulte a situação atual antes de alterar a exceção de atendimento.',
            409,
          );
        if (input.action === 'ALLOW_REQUESTS') {
          try {
            requireCurrentEnrollment(row, undefined, now);
            if (row.mode === 'SUBSEQUENTE') subsequentContext(row, now);
          } catch (error) {
            if (
              !(error instanceof EnrollmentValidityError) &&
              !(error instanceof DeclarationValidationError)
            )
              throw error;
            throw new RequestError(
              'A matrícula precisa estar conferida e vigente. Enturme o aluno ou confira os dados escolares antes de liberar solicitações. A exceção não altera datas nem etapa.',
              422,
            );
          }
        }
        patch = { repetitionOverride: input.action === 'ALLOW_REQUESTS' };
      } else {
        if (!row.repetitionPending)
          throw new RequestError(
            'Esta matrícula não está aguardando turma por repetência.',
            409,
          );
        const repeated = await tx.schoolAcademicEvent.findFirst({
          where: { enrollmentId: row.id, kind: 'REPEAT' },
          orderBy: { revision: 'desc' },
        });
        patch = {
          repetitionPending: false,
          repetitionOverride: false,
          progressionHeld:
            object(repeated?.beforeState).progressionHeld !== false,
        };
      }
      await recordAcademicChange(tx, row, patch, {
        kind:
          input.action === 'REPEAT_PREVIOUS'
            ? 'REPEAT'
            : input.action === 'ALLOW_REQUESTS' ||
                input.action === 'WAIT_REQUESTS'
              ? 'OVERRIDE'
              : input.action,
        actorId,
        operationKey,
        requestHash,
        correctsEventId: correctedEventId,
        actorName: actor.name ?? 'Responsável da secretaria',
        effectiveOn: calendarDay(now),
        reason: input.reason,
      });
      created = true;
      // A confirmação inicial não é um botão de promover: só aplica o que já venceu.
      await applyStudentAcademicProgression(tx, target.studentId, now);
      row = await tx.enrollment.findUniqueOrThrow({
        where: { id: row.id },
        include: academicInclude,
      });
    }
  }
  const total = await tx.schoolAcademicEvent.count({
      where: { enrollmentId: row.id },
    }),
    pageSize = 20,
    page = Math.min(
      input.operation === 'detail' ? input.page : 1,
      Math.max(1, Math.ceil(total / pageSize)),
    );
  const history = await tx.schoolAcademicEvent.findMany({
    where: { enrollmentId: row.id },
    orderBy: { revision: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { actor: { select: { student: { select: { fullName: true } } } } },
  });
  const previous = await tx.schoolAcademicEvent.findFirst({
    where: { enrollmentId: row.id, kind: 'PROGRESSION' },
    orderBy: { revision: 'desc' },
  });
  const past = object(previous?.beforeState),
    after = object(previous?.afterState);
  const compatible =
    previous &&
    after.className === row.className &&
    after.periodLabel === row.periodLabel &&
    after.grade === row.grade &&
    after.moduleNumber === row.moduleNumber &&
    after.offeringId === row.offeringId;
  const prior = row.mode === 'INTEGRADO' ? past.grade : past.moduleNumber;
  const previousStage = compatible && typeof prior === 'number' ? prior : null;
  let nextDate: string | null = null;
  try {
    nextDate = nextAcademicStage({
      mode: row.mode,
      courseLabel: row.courseLabel as 'ADM' | 'DS' | 'ENF',
      stage: (row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber) ?? 0,
      periodLabel: row.periodLabel ?? '',
    }).effectiveOn;
  } catch {
    /* Última etapa ou referência incompleta: nenhuma data inventada. */
  }
  return {
    academicWaiting:
      (await tx.enrollment.count({
        where: {
          studentId: row.studentId,
          status: { not: 'ENDED' },
          repetitionPending: true,
          repetitionOverride: false,
        },
      })) > 0,
    enrollment: {
      id: row.id,
      className: row.className,
      mode: row.mode,
      courseLabel: row.courseLabel,
      stage: row.mode === 'INTEGRADO' ? row.grade : row.moduleNumber,
      periodLabel: row.periodLabel,
      status: row.status,
      validFrom: date(row.validFrom),
      validUntil: date(row.validUntil),
      progressionHeld: row.progressionHeld,
      repetitionPending: row.repetitionPending,
      repetitionOverride: row.repetitionOverride,
      nextClassName: row.nextClassName,
      version: academicVersion(row),
      nextDate,
      previousStage,
      canReopen:
        row.status === 'ENDED' &&
        consistentClosure(
          row,
          await tx.schoolAcademicEvent.findFirst({
            where: { enrollmentId: row.id, kind: 'END' },
            orderBy: { revision: 'desc' },
          }),
        ),
    },
    history: history.map((e) => ({
      kind: e.kind,
      ...(e.kind === 'OVERRIDE'
        ? { requestsAllowed: object(e.afterState).repetitionOverride === true }
        : {}),
      reason: e.reason,
      date: e.createdAt.toISOString(),
      effectiveOn: date(e.effectiveOn)!,
      actor: e.actorId
        ? String(
            object(e.afterState).actorLabel ??
              e.actor?.student.fullName ??
              'Responsável da secretaria',
          )
        : 'Sistema automático',
    })),
    total,
    page,
    pageSize,
    ...(created === undefined ? {} : { created }),
  };
}
export async function administerAcademicEnrollment(
  actorId: string,
  value: unknown,
) {
  if (!declarationPortalEnabled())
    throw new RequestError('Página não disponível.', 404);
  const input = readAcademicAdminInput(value);
  return getDb().$transaction(
    (tx) => manageAcademicEnrollment(tx, actorId, input),
    { maxWait: 5000, timeout: 15000 },
  );
}
