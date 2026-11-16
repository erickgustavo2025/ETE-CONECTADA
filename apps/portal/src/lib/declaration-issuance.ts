import {
  synchronizeOwnAcademicState,
  applyStudentAcademicProgression,
  requireAcademicRequestAccess,
} from './school-academic';
import { lockStudentAccess, requireIssuanceAccess } from './student-access';
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from './db';
import { studentDeclarationSelect } from './declarations';
import { declarationRegistryPreviewEnabled } from './declaration-documents';
import {
  readIssuanceInput,
  testIssuanceContent,
  issuanceBirthplace,
} from './declaration-issuance-input';
import { createDeclarationPdf } from './declaration-pdf';
import { preparePdfArchive } from './declaration-pdf-archive-input';
import { RequestError, validRequestId } from './declaration-requests';
import { calendarDay } from './course-calendar-input';
import { verificationLink } from './public-verification-input';

const issuedSelect = {
  id: true,
  publicCode: true,
  enrollmentId: true,
  createdAt: true,
  status: true,
  origin: true,
  terminalActions: { select: { action: true } },
} as const;
const result = (
  document: {
    id: string;
    publicCode: string;
    enrollmentId: string;
    createdAt: Date;
    status: string;
    origin: string;
    terminalActions: { action: string }[];
  },
  created: boolean,
) => ({
  created,
  document: {
    id: document.id,
    publicCode: document.publicCode,
    enrollmentId: document.enrollmentId,
    createdAt: document.createdAt.toISOString(),
    state: document.terminalActions[0]?.action ?? document.status,
    testOnly: true,
  },
});

// O ator vem da sessão; somente o local de nascimento pode ser declarado pelo aluno.
export async function issueTestDeclaration(
  accountId: string,
  value: unknown,
  birthplace?: unknown,
) {
  if (!declarationRegistryPreviewEnabled())
    throw new RequestError('Recurso indisponível.', 404);
  if (!validRequestId(accountId))
    throw new RequestError('Acesso não autorizado.', 403);
  const input = readIssuanceInput(value);
  const db = getDb();
  const actor = await db.account.findFirst({
    where: { id: accountId, status: 'active', role: 'student' },
    select: {
      studentId: true,
      student: { select: { loginBlocked: true, issuanceBlocked: true } },
    },
  });
  if (!actor || actor.student.loginBlocked)
    throw new RequestError('Entre novamente para continuar.', 403);
  const key = {
    createdById_requestKey: {
      createdById: accountId,
      requestKey: input.requestKey,
    },
  };
  const replay = await db.declarationDocument.findUnique({
    where: key,
    select: issuedSelect,
  });
  if (!replay) {
    requireIssuanceAccess(actor.student);
    await requireAcademicRequestAccess(db, actor.studentId);
    await synchronizeOwnAcademicState(accountId);
  }
  // Repetição de chave não gera um novo PDF, mesmo se o cadastro mudou depois.
  const original = replay
    ? null
    : await db.student.findUniqueOrThrow({
        where: { id: actor.studentId },
        select: studentDeclarationSelect,
      });
  const content = original
    ? testIssuanceContent(
        issuanceBirthplace(original, birthplace),
        input.enrollmentId,
      )
    : null;
  const createdAt = new Date();
  const id = randomUUID(),
    publicCode = randomBytes(32).toString('base64url');
  const verification = content
    ? { code: publicCode, url: verificationLink(publicCode) }
    : null;
  const file = content
    ? await preparePdfArchive(
        await createDeclarationPdf(
          content.student,
          content.fields,
          verification!,
        ),
        1,
        'minuta-a4-qr-v1',
      )
    : null;
  return db.$transaction(
    async (tx) => {
      const allowed = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM accounts WHERE id=${accountId}::uuid AND student_id=${actor.studentId}::uuid AND status='active' AND role='student' FOR UPDATE`;
      if (!allowed.length)
        throw new RequestError('Seu acesso mudou. Entre novamente.', 403);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
      const access = await lockStudentAccess(tx, actor.studentId);
      const previousRequest = await tx.declarationDocument.findUnique({
        where: key,
        select: issuedSelect,
      });
      if (previousRequest) {
        if (
          previousRequest.enrollmentId !== input.enrollmentId ||
          previousRequest.status !== 'ISSUED' ||
          previousRequest.origin !== 'STUDENT_REQUEST'
        )
          throw new RequestError(
            'Esta solicitação já foi usada para outra matrícula.',
            409,
          );
        return result(previousRequest, false);
      }
      requireIssuanceAccess(access);
      await requireAcademicRequestAccess(tx, actor.studentId);
      await applyStudentAcademicProgression(tx, actor.studentId);
      if (!content || !file)
        throw new RequestError('Atualize a página e tente novamente.', 409);
      await tx.$queryRaw`SELECT student_id FROM student_details WHERE student_id=${actor.studentId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${input.enrollmentId}::uuid AND student_id=${actor.studentId}::uuid FOR UPDATE`;
      const fresh = await tx.student.findUniqueOrThrow({
        where: { id: actor.studentId },
        select: studentDeclarationSelect,
      });
      if (
        testIssuanceContent(
          issuanceBirthplace(fresh, birthplace),
          input.enrollmentId,
        ).fingerprint !== content.fingerprint ||
        calendarDay(createdAt) !== calendarDay(new Date())
      )
        throw new RequestError(
          'Os dados mudaram durante a geração. Tente novamente.',
          409,
        );
      if (
        birthplace !== undefined &&
        content.student.details?.birthplaceSource === 'STUDENT_DECLARATION'
      ) {
        const details = content.student.details;
        await tx.studentDetails.update({
          where: { studentId: actor.studentId },
          data: {
            birthCity: details.birthCity,
            birthState: details.birthState,
            birthCountry: details.birthCountry,
            birthplaceSource: 'STUDENT_DECLARATION',
            updatedById: accountId,
          },
        });
      }
      await tx.declarationPdfArchive.createMany({
        data: [file],
        skipDuplicates: true,
      });
      const document = await tx.declarationDocument.create({
        data: {
          id,
          publicCode,
          studentId: actor.studentId,
          enrollmentId: input.enrollmentId,
          createdById: accountId,
          createdAt,
          status: 'ISSUED',
          origin: 'STUDENT_REQUEST',
          requestKey: input.requestKey,
          snapshotVersion: 2,
          snapshot: {
            ...content.snapshot,
            verificationVersion: 1,
            verificationUrl: verification!.url,
          },
          sourcePdfSha256: file.sha256,
          archiveSha256: file.sha256,
          sourcePdfPage: 1,
        },
        select: issuedSelect,
      });
      const scope = {
        enrollmentId_documentType: {
          enrollmentId: input.enrollmentId,
          documentType: 'DECLARACAO_VINCULO',
        },
      };
      const current = await tx.declarationCurrentIssue.findUnique({
        where: scope,
        include: {
          document: {
            select: { id: true, terminalActions: { select: { action: true } } },
          },
        },
      });
      if (current && !current.document.terminalActions.length) {
        await tx.declarationDocumentAction.create({
          data: {
            documentId: current.documentId,
            studentId: actor.studentId,
            enrollmentId: input.enrollmentId,
            action: 'SUPERSEDED',
            reason: 'Substituída automaticamente por nova emissão de teste.',
            successorId: document.id,
            createdById: accountId,
          },
        });
      }
      await tx.declarationCurrentIssue.upsert({
        where: scope,
        create: {
          studentId: actor.studentId,
          enrollmentId: input.enrollmentId,
          documentType: 'DECLARACAO_VINCULO',
          documentId: document.id,
        },
        update: { documentId: document.id },
      });
      await tx.declarationRequest.create({
        data: {
          studentId: actor.studentId,
          enrollmentId: input.enrollmentId,
          status: 'AVAILABLE',
          generatedAt: createdAt,
          documentId: document.id,
        },
      });
      return result(document, true);
    },
    { timeout: 15000 },
  );
}
