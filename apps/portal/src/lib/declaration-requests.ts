import { preparePdfArchive } from './declaration-pdf-archive-input';
import {
  declarationRegistryPreviewEnabled,
  documentInsertData,
  type PreparedDeclarationDocument,
} from './declaration-documents';
import { Prisma } from '@/generated/prisma/client';
import { getDb } from './db';
import {
  DeclarationValidationError,
  enrollmentDeclarationSelect,
  subsequentContext,
} from './declarations';
import type { RequestSummary } from './declaration-request-types';
import {
  BirthplaceError,
  validateDeclaredBirthplace,
} from './birthplace-catalog';
import {
  requireCurrentEnrollment,
  EnrollmentValidityError,
} from './enrollment-validity';

async function lockSecretary(tx: Prisma.TransactionClient, accountId: string) {
  const allowed = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM accounts WHERE id=${accountId}::uuid AND status='active' AND role='secretary' FOR UPDATE
  `;
  if (!allowed.length) throw new RequestError('Acesso não autorizado.', 403);
}

async function lockEnrollments(tx: Prisma.TransactionClient, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM enrollments WHERE id IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE
  `);
  return tx.enrollment.findMany({
    where: { id: { in: unique } },
    select: { ...enrollmentDeclarationSelect, studentId: true },
  });
}

export const requestSummarySelect = {
  id: true,
  status: true,
  createdAt: true,
  generatedAt: true,
  readyAt: true,
  enrollmentId: true,
  enrollment: { select: { className: true } },
  document: {
    select: {
      id: true,
      status: true,
      terminalActions: { select: { action: true } },
    },
  },
} satisfies Prisma.DeclarationRequestSelect;
export function requestSummary(
  row: Prisma.DeclarationRequestGetPayload<{
    select: typeof requestSummarySelect;
  }>,
): RequestSummary {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    enrollmentId: row.enrollmentId,
    className: row.enrollment.className,
    ...(row.document
      ? {
          document: {
            id: row.document.id,
            state:
              row.document.terminalActions[0]?.action ?? row.document.status,
          },
        }
      : {}),
  };
}
export async function studentRequests(studentId: string) {
  return (
    await getDb().declarationRequest.findMany({
      where: { studentId },
      select: requestSummarySelect,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  ).map(requestSummary);
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requestDeclaration(
  studentId: string,
  enrollmentId: string,
  options: { accountId: string; birthplace?: unknown },
) {
  if (![studentId, enrollmentId, options.accountId].every(validRequestId))
    throw new RequestError('Acesso não autorizado.', 403);
  const birthplace =
    options.birthplace === undefined
      ? null
      : validateDeclaredBirthplace(options.birthplace);
  return getDb().$transaction(
    async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM accounts WHERE id=${options.accountId}::uuid
        AND student_id=${studentId}::uuid AND status='active'
        AND role IN ('student','secretary') FOR UPDATE
      `;
      if (!allowed.length)
        throw new RequestError('Entre novamente para continuar.', 403);
      // Serializa cliques repetidos; o índice parcial também protege chamadas concorrentes.
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
      const enrollment = await tx.enrollment.findFirst({
        where: { id: enrollmentId, studentId },
        select: { mode: true },
      });
      if (!enrollment)
        throw new RequestError(
          'Matrícula não encontrada na sua conta. Procure a secretaria.',
          422,
        );
      if (!['INTEGRADO', 'SUBSEQUENTE'].includes(enrollment.mode))
        throw new RequestError(
          'Esta modalidade precisa de conferência da secretaria.',
          422,
        );
      const existing = await tx.declarationRequest.findFirst({
        where: {
          enrollmentId,
          status: { in: ['REQUESTED', 'IN_PREPARATION'] },
        },
        select: requestSummarySelect,
      });
      if (existing)
        return { request: requestSummary(existing), created: false };
      const details = await tx.studentDetails.findUnique({
        where: { studentId },
      });
      if (birthplace) {
        const protectedSource =
          details?.birthplaceSource === 'SCHOOL_RECORD' ||
          details?.birthplaceSource === 'SECRETARY_CORRECTION';
        if (
          protectedSource &&
          (details.birthCity !== birthplace.birthCity ||
            details.birthState !== birthplace.birthState ||
            details.birthCountry !== birthplace.birthCountry)
        )
          throw new RequestError(
            'Seu local de nascimento já foi conferido pela escola. Procure a secretaria para corrigir.',
            422,
          );
        if (!protectedSource)
          await tx.studentDetails.upsert({
            where: { studentId },
            create: {
              studentId,
              ...birthplace,
              updatedById: options.accountId,
            },
            update: { ...birthplace, updatedById: options.accountId },
          });
      } else if (
        !details?.birthCity ||
        !details.birthCountry ||
        (details.birthCountry === 'BR' && !details.birthState)
      ) {
        throw new RequestError(
          'Informe o estado e o município onde você nasceu antes de enviar o pedido.',
          422,
        );
      }
      const row = await tx.declarationRequest.create({
        data: { studentId, enrollmentId },
        select: requestSummarySelect,
      });
      return { request: requestSummary(row), created: true };
    },
    { timeout: 15000 },
  );
}

// Só uma geração bem-sucedida, com os dados conferidos, inicia a preparação.
// Não altera o cadastro do aluno nem anuncia retirada. O registro experimental
// preserva o conteúdo da minuta somente quando habilitado explicitamente.
export async function recordGeneratedDeclarations(
  items: {
    studentId: string;
    enrollmentId: string;
    periodLabel: string;
    reviewedAt: Date | null;
    calendarRevision?: number | null;
  }[],
  accountId: string,
  documentBatch?: { records: PreparedDeclarationDocument[]; pdf: Uint8Array },
) {
  if (
    documentBatch &&
    (!declarationRegistryPreviewEnabled() ||
      documentBatch.records.length !== items.length ||
      documentBatch.records.some(
        (record, index) =>
          record.studentId !== items[index].studentId ||
          record.enrollmentId !== items[index].enrollmentId ||
          record.sourcePdfPage !== index + 1,
      ))
  )
    throw new DeclarationValidationError('Registro de minuta indisponível.');
  if (!items.length) return;
  const archive = documentBatch
    ? await preparePdfArchive(documentBatch.pdf, documentBatch.records.length)
    : undefined;
  await getDb().$transaction(async (tx) => {
    await lockSecretary(tx, accountId);
    // Mesma ordem das alterações de calendário e importação.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
    const rows = await lockEnrollments(
      tx,
      items.map((item) => item.enrollmentId),
    );
    for (const item of items) {
      const enrollment = rows.find(
        (row) =>
          row.id === item.enrollmentId && row.studentId === item.studentId,
      );
      if (!enrollment)
        throw new DeclarationValidationError('Matrícula não disponível.');
      try {
        requireCurrentEnrollment(enrollment, item.periodLabel);
        if (enrollment.mode === 'SUBSEQUENTE') {
          subsequentContext(enrollment);
          if (item.calendarRevision !== enrollment.calendarRevision)
            throw new DeclarationValidationError(
              'O calendário mudou durante a geração. Confira e gere novamente.',
              'enrollmentId',
            );
        }
      } catch (error) {
        if (error instanceof EnrollmentValidityError)
          throw new DeclarationValidationError(error.message, error.field);
        throw error;
      }
      if (enrollment.reviewedAt?.getTime() !== item.reviewedAt?.getTime())
        throw new DeclarationValidationError(
          'A matrícula mudou durante a geração. Confira e gere novamente.',
        );
    }
    if (documentBatch && archive) {
      await tx.declarationPdfArchive.createMany({
        data: [archive],
        skipDuplicates: true,
      });
      await tx.declarationDocument.createMany({
        data: documentInsertData(
          documentBatch.records,
          documentBatch.pdf,
          accountId,
        ).map((record) => ({ ...record, archiveSha256: archive.sha256 })),
      });
    }
    await tx.declarationRequest.updateMany({
      where: {
        status: { in: ['REQUESTED', 'IN_PREPARATION'] },
        OR: items.map((item) => ({
          studentId: item.studentId,
          enrollmentId: item.enrollmentId,
        })),
      },
      data: {
        status: 'IN_PREPARATION',
        generatedAt: new Date(),
        preparedById: accountId,
      },
    });
  });
}
export async function markReadyForPickup(id: string, accountId: string) {
  return getDb().$transaction(
    async (tx) => {
      await lockSecretary(tx, accountId);
      const before = await tx.declarationRequest.findUnique({
        where: { id },
        select: { enrollmentId: true },
      });
      if (!before)
        throw new RequestError(
          'Solicitação não encontrada. Atualize a lista.',
          404,
        );
      const [enrollment] = await lockEnrollments(tx, [before.enrollmentId]);
      await tx.$queryRaw`SELECT id FROM declaration_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.declarationRequest.findUnique({
        where: { id },
        select: requestSummarySelect,
      });
      if (!row)
        throw new RequestError(
          'Solicitação não encontrada. Atualize a lista.',
          404,
        );
      if (row.status === 'READY_FOR_PICKUP') return requestSummary(row);
      if (row.status !== 'IN_PREPARATION')
        throw new RequestError(
          'Gere o PDF e prepare o documento antes de liberar a retirada.',
          409,
        );
      if (!enrollment || row.enrollmentId !== enrollment.id)
        throw new RequestError('Matrícula não disponível.', 409);
      requireCurrentEnrollment(enrollment);
      if (
        !row.generatedAt ||
        !enrollment.reviewedAt ||
        enrollment.reviewedAt > row.generatedAt
      )
        throw new RequestError(
          'A matrícula mudou após a preparação. Confira e gere o PDF novamente.',
          409,
        );
      return requestSummary(
        await tx.declarationRequest.update({
          where: { id },
          data: {
            status: 'READY_FOR_PICKUP',
            readyAt: new Date(),
            readyById: accountId,
          },
          select: requestSummarySelect,
        }),
      );
    },
    { timeout: 15000 },
  );
}
export function validRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function requestFailure(error: unknown) {
  if (error instanceof BirthplaceError)
    return { error: error.message, status: 422 };
  if (error instanceof EnrollmentValidityError)
    return { error: error.message, status: 422 };
  if (error instanceof RequestError)
    return { error: error.message, status: error.status };
  if (error instanceof DeclarationValidationError)
    return { error: error.message, status: 422 };
  return {
    error:
      'Não foi possível concluir. Seus dados foram preservados; tente novamente.',
    status: 503,
  };
}
