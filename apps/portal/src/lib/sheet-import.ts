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
    throw new SheetImportError('Oferta acima do limite de conferência.');
  return { students, enrollments };
}
type State = Awaited<ReturnType<typeof state>>;
function plan(input: SheetInput, current: State) {
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
          (enrollment.schoolImportKey &&
            enrollment.schoolImportKey !== row.key))) ||
      (!enrollment &&
        row.enrollmentId !== 'new' &&
        student &&
        existingCourses.has(
          `${student.id}:${input.mode}:${row.context.courseLabel}`,
        )),
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
      metadataChanged || enrollment?.schoolImportKey !== row.key;
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
      changes,
      identityChanged,
      parentsChanged,
      metadataChanged,
      enrollmentChanged,
      blocked,
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
  return { counts, entries };
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
          'A prévia expirou ou não corresponde ao arquivo/operador. Gere outra prévia.',
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
          'Resolva os conflitos antes de confirmar.',
          409,
        );
      if (prepared.counts.identityChanges && acceptIdentityChanges !== true)
        throw new SheetImportError(
          'Confirme explicitamente as alterações de nome, nascimento ou filiação.',
          409,
        );
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
        if (!entry.enrollment)
          await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: input.mode,
              ...metadata,
              schoolImportKey: row.key,
            },
          });
        else if (entry.enrollmentChanged)
          await tx.enrollment.update({
            where: { id: entry.enrollment.id },
            data: {
              ...metadata,
              schoolImportKey: row.key,
              ...(entry.metadataChanged
                ? {
                    status: 'UNCONFIRMED' as const,
                    reviewedAt: null,
                    reviewedById: null,
                  }
                : {}),
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
