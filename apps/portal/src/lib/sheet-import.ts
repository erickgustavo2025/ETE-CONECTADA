import { calendarImportState } from './course-calendars';
import { moduleOnDate, calendarDay } from './course-calendar-input';
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  digest,
  SheetImportError,
  uuid,
  type SheetInput,
} from './sheet-import-input';

type Tx = Prisma.TransactionClient;
async function authorize(tx: Tx, actorId: string) {
  if (!uuid.test(actorId))
    throw new SheetImportError('Acesso não autorizado.', 403);
  const allowed = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM accounts WHERE id=${actorId}::uuid AND role='secretary' AND status='active' FOR UPDATE`;
  if (!allowed.length)
    throw new SheetImportError('Acesso não autorizado.', 403);
  // Importações de operadores distintos não disputam ofertas/cadastros simultaneamente.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
}
async function state(tx: Tx, input: SheetInput) {
  const students = await tx.student.findMany({
    where: {
      schoolRegistration: { in: input.rows.map((r) => r.schoolRegistration) },
    },
    select: {
      id: true,
      schoolRegistration: true,
      fullName: true,
      birthDate: true,
      details: {
        select: {
          parentOne: true,
          parentTwo: true,
          parentageSource: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  const enrollments = await tx.enrollment.findMany({
    where: {
      OR: [
        { studentId: { in: students.map((student) => student.id) } },
        ...input.contexts.map((c) => ({
          schoolImportKey: { startsWith: `school:${c.scopeId}:` },
        })),
        {
          id: {
            in: input.rows.flatMap((r) =>
              r.enrollmentId && r.enrollmentId !== 'new'
                ? [r.enrollmentId]
                : [],
            ),
          },
        },
      ],
    },
    orderBy: { id: 'asc' },
    take: 10001,
  });
  if (enrollments.length > 10000)
    throw new SheetImportError(
      'Esta turma tem mais registros do que é possível conferir de uma vez. Procure o suporte.',
    );
  const calendars =
    input.mode === 'SUBSEQUENTE'
      ? await calendarImportState(tx, [
          ...new Set(input.contexts.map((c) => c.scopeId)),
        ])
      : [];
  return {
    students,
    enrollments,
    calendars,
    calendarDay: input.mode === 'SUBSEQUENTE' ? calendarDay(new Date()) : null,
  };
}
type State = Awaited<ReturnType<typeof state>>;
function plan(input: SheetInput, current: State) {
  const calendarComparisons =
    input.mode !== 'SUBSEQUENTE'
      ? []
      : input.contexts.map((context) => {
          const calendar = current.calendars.find(
            (c) => c.id === context.scopeId,
          );
          const expected = calendar
            ? (moduleOnDate(
                calendar.draft,
                new Date(current.calendarDay + 'T12:00:00Z'),
              ) ?? calendar.draft.modules[0])
            : null;
          return {
            scopeId: context.scopeId,
            sheetName: context.sheetName,
            configured: !!calendar,
            revision: calendar?.version.revision ?? null,
            receivedModule: context.stage,
            expectedModule: expected?.number ?? null,
            receivedPeriod: context.periodLabel,
            expectedPeriod: expected?.periodLabel ?? null,
            differs:
              !!expected &&
              (expected.number !== context.stage ||
                expected.periodLabel !== context.periodLabel),
          };
        });

  const studentsByRegistration = new Map(
    current.students.map((student) => [student.schoolRegistration, student]),
  );
  const enrollmentsByKey = new Map(
    current.enrollments.map((enrollment) => [
      enrollment.schoolImportKey,
      enrollment,
    ]),
  );
  const enrollmentsById = new Map(
    current.enrollments.map((enrollment) => [enrollment.id, enrollment]),
  );
  const existingCourses = new Set(
    current.enrollments.map(
      (enrollment) =>
        `${enrollment.studentId}:${enrollment.mode}:${enrollment.courseLabel}`,
    ),
  );
  const invalidScopes = new Set(
    input.contexts
      .filter((context) =>
        current.enrollments.some(
          (enrollment) =>
            enrollment.schoolImportKey?.startsWith(
              `school:${context.scopeId}:`,
            ) &&
            (enrollment.mode !== input.mode ||
              enrollment.courseLabel !== context.courseLabel),
        ),
      )
      .map((context) => context.scopeId),
  );
  for (const calendar of current.calendars) {
    const contexts = input.contexts.filter(
      (context) => context.scopeId === calendar.id,
    );
    if (
      contexts.some(
        (context) => context.courseLabel !== calendar.courseLabel,
      ) ||
      new Set(
        contexts.map((context) => `${context.stage}:${context.periodLabel}`),
      ).size > 1
    )
      invalidScopes.add(calendar.id);
  }
  const counts = {
    createdStudents: 0,
    createdEnrollments: 0,
    updatedStudents: 0,
    updatedEnrollments: 0,
    unchanged: 0,
    absent: 0,
    conflicts: 0,
    identityChanges: 0,
  };
  const entries = input.rows.map((row) => {
    const student = studentsByRegistration.get(row.schoolRegistration);
    const keyed = enrollmentsByKey.get(row.key);
    const bound = row.enrollmentId
      ? enrollmentsById.get(row.enrollmentId)
      : undefined;
    const enrollment = keyed || bound;
    const conflict = Boolean(
      (row.enrollmentId &&
        row.enrollmentId !== 'new' &&
        (!bound || bound.studentId !== student?.id)) ||
      (keyed && bound && keyed.id !== bound.id) ||
      (enrollment &&
        (enrollment.studentId !== student?.id ||
          enrollment.mode !== input.mode ||
          enrollment.courseLabel !== row.context.courseLabel ||
          (enrollment.offeringId &&
            enrollment.offeringId !== row.context.scopeId) ||
          (enrollment.schoolImportKey &&
            enrollment.schoolImportKey !== row.key))) ||
      (!enrollment &&
        row.enrollmentId !== 'new' &&
        student &&
        existingCourses.has(
          `${student.id}:${input.mode}:${row.context.courseLabel}`,
        )),
    );
    const calendar = current.calendars.find(
      (c) => c.id === row.context.scopeId,
    );
    const offeringChanged = !!calendar && !enrollment?.offeringId;
    const calendarException =
      !!calendar &&
      !!enrollment &&
      !enrollment.progressionHeld &&
      calendarComparisons.some(
        (c) => c.scopeId === row.context.scopeId && c.differs,
      );
    const metadata = {
      className: row.context.className,
      courseLabel: row.context.courseLabel,
      periodLabel: row.context.periodLabel,
      grade: input.mode === 'INTEGRADO' ? row.context.stage : null,
      moduleNumber: input.mode === 'SUBSEQUENTE' ? row.context.stage : null,
    };
    const changes: Array<{
      field: string;
      before: string | null;
      after: string | null;
    }> = [];
    const change = (field: string, before: unknown, after: unknown) => {
      if (before !== after)
        changes.push({
          field,
          before: before == null ? null : String(before),
          after: after == null ? null : String(after),
        });
    };
    if (student) {
      change('fullName', student.fullName, row.fullName);
      change(
        'birthDate',
        student.birthDate.toISOString().slice(0, 10),
        row.birthDate,
      );
    }
    const identityChanged = changes.length > 0;
    if (row.parentOne)
      change('parentOne', student?.details?.parentOne, row.parentOne);
    if (row.parentTwo)
      change('parentTwo', student?.details?.parentTwo, row.parentTwo);
    const parentsChanged = changes.some((c) => c.field.startsWith('parent'));
    if (enrollment)
      for (const [key, value] of Object.entries(metadata))
        change(key, enrollment[key as keyof typeof metadata], value);
    const metadataChanged =
      !enrollment ||
      Object.entries(metadata).some(
        ([k, v]) => enrollment[k as keyof typeof metadata] !== v,
      );
    const enrollmentChanged =
      metadataChanged ||
      offeringChanged ||
      calendarException ||
      enrollment?.schoolImportKey !== row.key;
    const protectedParent =
      parentsChanged &&
      student?.details?.parentageSource === 'SECRETARY_CORRECTION';
    const blocked =
      conflict ||
      protectedParent ||
      invalidScopes.has(row.context.scopeId) ||
      (enrollment?.status === 'ENDED' && metadataChanged);
    if (blocked) counts.conflicts++;
    else {
      if (!student) counts.createdStudents++;
      else if (identityChanged || parentsChanged) counts.updatedStudents++;
      if (!enrollment) counts.createdEnrollments++;
      else if (enrollmentChanged) counts.updatedEnrollments++;
      if (student && enrollment && !changes.length && !enrollmentChanged)
        counts.unchanged++;
      if (student && (identityChanged || parentsChanged))
        counts.identityChanges++;
    }
    return {
      row,
      student,
      enrollment,
      metadata,
      calendar,
      offeringChanged,
      calendarException,
      changes,
      identityChanged,
      parentsChanged,
      metadataChanged,
      enrollmentChanged,
      blocked,
      needsBinding: Boolean(
        conflict &&
        !enrollment &&
        !row.enrollmentId &&
        student &&
        !protectedParent &&
        !invalidScopes.has(row.context.scopeId),
      ),
    };
  });
  const presentKeys = new Set(input.rows.map((row) => row.key));
  const scopes = new Set(input.contexts.map((context) => context.scopeId));
  counts.absent = current.enrollments.filter(
    (enrollment) =>
      enrollment.schoolImportKey &&
      scopes.has(enrollment.schoolImportKey.split(':')[1]) &&
      !presentKeys.has(enrollment.schoolImportKey),
  ).length;
  return { counts, entries, calendarComparisons };
}
// Catálogo por fontes aplicadas no integrado e calendários no subsequente, sem identidades.
export async function schoolImportSources(
  db: PrismaClient,
  actorId: string,
  mode: SheetInput['mode'],
) {
  return db.$transaction(
    async (tx) => {
      await authorize(tx, actorId);
      const rows = await tx.enrollment.findMany({
        where: { mode, schoolImportKey: { not: null } },
        select: {
          schoolImportKey: true,
          className: true,
          courseLabel: true,
          periodLabel: true,
        },
        orderBy: { id: 'asc' },
        take: 10001,
      });
      if (rows.length > 10000)
        throw new SheetImportError(
          'Há mais turmas do que é possível carregar de uma vez. Procure o suporte.',
        );
      const sources = new Map<
        string,
        {
          scopeId: string;
          courseLabel: string;
          classes: Set<string>;
          periods: Set<string>;
        }
      >();
      for (const row of rows) {
        const scopeId = row.schoolImportKey?.split(':')[1] || '';
        if (!uuid.test(scopeId))
          throw new SheetImportError(
            'Não foi possível identificar a turma desta lista. Confira a turma escolhida.',
          );
        const source = sources.get(scopeId) || {
          scopeId,
          courseLabel: row.courseLabel,
          classes: new Set<string>(),
          periods: new Set<string>(),
        };
        if (source.courseLabel !== row.courseLabel)
          throw new SheetImportError(
            'A turma selecionada tem registros de cursos diferentes. Confira os cadastros antes de importar.',
          );
        source.classes.add(row.className);
        source.periods.add(row.periodLabel || '');
        sources.set(scopeId, source);
      }
      if (sources.size > 200)
        throw new SheetImportError(
          'Há mais de 200 turmas cadastradas. Procure o suporte antes de importar.',
        );
      if (mode === 'SUBSEQUENTE') {
        const calendars = await calendarImportState(tx);
        return calendars
          .map((course) => {
            const source = sources.get(course.id);
            if (source && source.courseLabel !== course.courseLabel)
              throw new SheetImportError(
                'O curso da lista é diferente do curso do calendário. Confira a turma escolhida.',
              );
            return {
              scopeId: course.id,
              courseLabel: course.courseLabel,
              className:
                source?.classes.size === 1 ? [...source.classes][0] : '',
              periodLabel: '',
              label: `${course.draft.label} · ${course.courseLabel}`,
              calendar: {
                revision: course.version.revision,
                currentModule: moduleOnDate(course.draft)?.number ?? null,
                modules: course.draft.modules.map((m) => ({
                  number: m.number,
                  periodLabel: m.periodLabel,
                })),
              },
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      }
      return [...sources.values()]
        .map((source) => ({
          scopeId: source.scopeId,
          courseLabel: source.courseLabel,
          className: source.classes.size === 1 ? [...source.classes][0] : '',
          periodLabel: source.periods.size === 1 ? [...source.periods][0] : '',
          label: `${[...source.classes].slice(0, 2).join(' / ')} · ${source.courseLabel} · ${[
            ...source.periods,
          ]
            .slice(0, 2)
            .map((p) => p || 'período não conferido')
            .join(
              ' / ',
            )}${source.classes.size > 2 || source.periods.size > 2 ? ' · outras variações' : ''}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}

export async function previewSheetImport(
  db: PrismaClient,
  actorId: string,
  input: SheetInput,
) {
  return db.$transaction(
    async (tx) => {
      await authorize(tx, actorId);
      const current = await state(tx, input),
        prepared = plan(input, current),
        token = randomBytes(32).toString('base64url'),
        expiresAt = new Date(Date.now() + 15 * 60_000);
      await tx.sheetImportPreview.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      const data = {
        tokenHash: digest(token),
        inputHash: input.inputHash,
        snapshotHash: digest(current),
        expiresAt,
        consumedAt: null,
        result: Prisma.DbNull,
      };
      await tx.sheetImportPreview.upsert({
        where: { actorId },
        create: { actorId, ...data },
        update: data,
      });
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        counts: prepared.counts,
        ...(input.mode === 'SUBSEQUENTE'
          ? { calendarComparisons: prepared.calendarComparisons }
          : {}),
        sheets: input.contexts.map((context) => ({
          sheetName: context.sheetName,
          scopeId: context.scopeId,
          periodLabel: context.periodLabel,
          className: context.className,
          courseLabel: context.courseLabel,
          stage: context.stage,
          mode: input.mode,
        })),
        entries: prepared.entries.map((e) => ({
          sheet: e.row.sheet,
          line: e.row.line,
          incoming: {
            schoolRegistration: e.row.schoolRegistration,
            fullName: e.row.fullName,
            birthDate: e.row.birthDate,
            parentOne: e.row.parentOne,
            parentTwo: e.row.parentTwo,
          },
          action: e.blocked
            ? 'conflict'
            : !e.student
              ? 'create'
              : e.changes.length || e.enrollmentChanged
                ? 'update'
                : 'unchanged',
          identityChange: Boolean(
            e.student && (e.identityChanged || e.parentsChanged),
          ),
          changes: e.changes,
          conflictReason: !e.blocked
            ? null
            : e.enrollment?.status === 'ENDED' && e.metadataChanged
              ? 'Esta matrícula está encerrada. Os dados não serão substituídos.'
              : e.parentsChanged &&
                  e.student?.details?.parentageSource === 'SECRETARY_CORRECTION'
                ? 'O nome do responsável nesta planilha é diferente do nome corrigido pela secretaria. Confira o registro escolar.'
                : 'Confira a matrícula, a turma e se a lista é do integrado ou do subsequente.',
          needsBinding: e.needsBinding,
          candidates: !e.needsBinding
            ? []
            : current.enrollments
                .filter(
                  (enrollment) =>
                    enrollment.studentId === e.student?.id &&
                    enrollment.mode === input.mode &&
                    enrollment.courseLabel === e.row.context.courseLabel &&
                    !enrollment.schoolImportKey,
                )
                .map((enrollment) => ({
                  id: enrollment.id,
                  className: enrollment.className,
                  periodLabel: enrollment.periodLabel,
                  status: enrollment.status,
                  grade: enrollment.grade,
                  moduleNumber: enrollment.moduleNumber,
                })),
        })),
      };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}
export async function confirmSheetImport(
  db: PrismaClient,
  actorId: string,
  input: SheetInput,
  token: unknown,
  confirmed: unknown,
  acceptIdentityChanges: unknown = false,
  acceptCalendarDifferences: unknown = false,
) {
  if (
    confirmed !== true ||
    typeof token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new SheetImportError('Confirme uma prévia válida.');
  return db.$transaction(
    async (tx) => {
      await authorize(tx, actorId);
      const preview = await tx.sheetImportPreview.findUnique({
        where: { actorId },
      });
      if (
        !preview ||
        preview.tokenHash !== digest(token) ||
        preview.inputHash !== input.inputHash ||
        preview.expiresAt < new Date()
      )
        throw new SheetImportError(
          'Esta prévia não pode mais ser usada. Confira o arquivo e gere uma nova prévia.',
          409,
        );
      if (preview.consumedAt) return preview.result;
      const current = await state(tx, input);
      if (digest(current) !== preview.snapshotHash)
        throw new SheetImportError(
          'Os dados mudaram após a prévia. Confira novamente.',
          409,
        );
      const prepared = plan(input, current);
      if (prepared.counts.conflicts)
        throw new SheetImportError(
          'Resolva as pendências da prévia antes de confirmar.',
          409,
        );
      if (prepared.counts.identityChanges && acceptIdentityChanges !== true)
        throw new SheetImportError(
          'Marque a confirmação das alterações de nome, nascimento ou nome dos pais.',
          409,
        );
      if (
        prepared.calendarComparisons.some((item) => item.differs) &&
        acceptCalendarDifferences !== true
      )
        throw new SheetImportError(
          'O módulo ou período da planilha é diferente do calendário. Confira os registros escolares e marque a confirmação para continuar.',
          409,
        );
      const metadataChanges = new Set(
        prepared.entries
          .filter(
            (entry) =>
              entry.enrollment &&
              (entry.metadataChanged ||
                entry.offeringChanged ||
                entry.calendarException),
          )
          .map((entry) => entry.enrollment!.id),
      );
      const changedIdentities = new Set(
        prepared.entries
          .filter((entry) => entry.identityChanged || entry.parentsChanged)
          .map((entry) => entry.student?.id),
      );
      // Captura o estado conferido antes de qualquer escrita; uma versão por vínculo.
      const history = current.enrollments
        .filter(
          (enrollment) =>
            metadataChanges.has(enrollment.id) ||
            (changedIdentities.has(enrollment.studentId) &&
              enrollment.status !== 'ENDED' &&
              (enrollment.status !== 'UNCONFIRMED' ||
                enrollment.reviewedAt !== null ||
                enrollment.reviewedById !== null)),
        )
        .map((enrollment) => ({
          enrollmentId: enrollment.id,
          recordedById: actorId,
          reason: metadataChanges.has(enrollment.id)
            ? 'METADATA_CHANGE'
            : 'IDENTITY_REVIEW',
          mode: enrollment.mode,
          className: enrollment.className,
          grade: enrollment.grade,
          moduleNumber: enrollment.moduleNumber,
          courseLabel: enrollment.courseLabel,
          schoolYear: enrollment.schoolYear,
          periodLabel: enrollment.periodLabel,
          validFrom: enrollment.validFrom,
          validUntil: enrollment.validUntil,
          status: enrollment.status,
          reviewedAt: enrollment.reviewedAt,
          offeringId: enrollment.offeringId,
          calendarRevision: enrollment.calendarRevision,
          progressionHeld: enrollment.progressionHeld,
        }));
      if (history.length)
        await tx.enrollmentImportHistory.createMany({ data: history });
      for (const entry of prepared.entries) {
        const { row, metadata } = entry;
        const student =
          entry.student ||
          (await tx.student.create({
            data: {
              schoolRegistration: row.schoolRegistration,
              fullName: row.fullName,
              birthDate: new Date(`${row.birthDate}T00:00:00Z`),
              registrationAllowed: false,
            },
          }));
        if (entry.identityChanged)
          await tx.student.update({
            where: { id: student.id },
            data: {
              fullName: row.fullName,
              birthDate: new Date(`${row.birthDate}T00:00:00Z`),
            },
          });
        if (entry.parentsChanged) {
          const data = {
            parentOne: row.parentOne,
            ...(row.parentTwo ? { parentTwo: row.parentTwo } : {}),
            parentageSource: 'SCHOOL_RECORD' as const,
            updatedById: actorId,
          };
          await tx.studentDetails.upsert({
            where: { studentId: student.id },
            create: { studentId: student.id, ...data },
            update: data,
          });
        }
        if (entry.identityChanged || entry.parentsChanged)
          await tx.enrollment.updateMany({
            where: { studentId: student.id, status: { not: 'ENDED' } },
            data: {
              status: 'UNCONFIRMED',
              reviewedAt: null,
              reviewedById: null,
            },
          });
        const association =
          entry.calendar &&
          (!entry.enrollment?.offeringId ||
            entry.metadataChanged ||
            entry.calendarException)
            ? {
                offeringId: entry.calendar.id,
                calendarRevision: entry.calendar.version.revision,
                calendarModule: row.context.stage,
                progressionHeld: true,
              }
            : {};
        if (!entry.enrollment)
          await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: input.mode,
              ...metadata,
              ...association,
              schoolImportKey: row.key,
            },
          });
        else if (entry.enrollmentChanged)
          await tx.enrollment.update({
            where: { id: entry.enrollment.id },
            data: {
              ...metadata,
              ...association,
              schoolImportKey: row.key,
              ...(entry.metadataChanged ||
              entry.offeringChanged ||
              entry.calendarException
                ? {
                    status: 'UNCONFIRMED' as const,
                    reviewedAt: null,
                    reviewedById: null,
                  }
                : {}),
            },
          });
      }
      for (const calendar of current.calendars) {
        const context = input.contexts.find((c) => c.scopeId === calendar.id);
        if (context)
          await tx.courseOffering.update({
            where: { id: calendar.id },
            data: {
              lastImportAt: new Date(),
              lastImportModule: context.stage,
              lastImportPeriod: context.periodLabel,
            },
          });
      }
      await tx.sheetImportPreview.update({
        where: { actorId },
        data: { consumedAt: new Date(), result: prepared.counts },
      });
      return prepared.counts;
    },
    { isolationLevel: 'Serializable', timeout: 120000 },
  );
}
