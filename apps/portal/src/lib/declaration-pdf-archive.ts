import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';
import { declarationPortalEnabled } from './declaration-documents';
import { PDF_ARCHIVE_MAX_BYTES } from './declaration-pdf-archive-input';

export class PdfArchiveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Secretaria pode conferir lotes. O caminho do aluno abaixo só devolve seu PDF individual.
export async function readArchivedDeclarationPdf(
  db: PrismaClient,
  accountId: string,
  documentId: string,
) {
  if (!declarationPortalEnabled())
    throw new PdfArchiveError('Recurso indisponível.', 404);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(accountId) || !uuid.test(documentId))
    throw new PdfArchiveError('Arquivo indisponível.', 404);
  return db.$transaction(async (tx) => {
    const actors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM accounts WHERE id=${accountId}::uuid AND status='active' AND role='secretary' FOR SHARE
    `;
    if (!actors.length)
      throw new PdfArchiveError('Acesso não autorizado.', 403);
    const document = await tx.declarationDocument.findUnique({
      where: { id: documentId },
      select: { archiveSha256: true },
    });
    if (!document?.archiveSha256)
      throw new PdfArchiveError(
        'O arquivo original não está disponível para este registro.',
        404,
      );
    const file = await tx.declarationPdfArchive.findUniqueOrThrow({
      where: { sha256: document.archiveSha256 },
    });
    if (
      !file.bytes.byteLength ||
      file.bytes.byteLength > PDF_ARCHIVE_MAX_BYTES ||
      createHash('sha256').update(file.bytes).digest('hex') !== file.sha256
    ) {
      throw new PdfArchiveError(
        'Não foi possível conferir o arquivo original.',
        503,
      );
    }
    return file;
  });
}

export async function readStudentDeclarationPdf(
  db: PrismaClient,
  accountId: string,
  documentId: string,
) {
  if (!declarationPortalEnabled())
    throw new PdfArchiveError('Recurso indisponível.', 404);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(accountId) || !uuid.test(documentId))
    throw new PdfArchiveError('Arquivo indisponível.', 404);
  return db.$transaction(async (tx) => {
    const [actor] = await tx.$queryRaw<Array<{ studentId: string }>>`
      SELECT student_id AS "studentId" FROM accounts WHERE id=${accountId}::uuid
      AND status='active' AND role='student' FOR SHARE
    `;
    if (!actor) throw new PdfArchiveError('Acesso não autorizado.', 403);
    const accessible = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM students WHERE id=${actor.studentId}::uuid AND NOT login_blocked FOR SHARE
    `;
    if (!accessible.length)
      throw new PdfArchiveError('Acesso não autorizado.', 403);
    const document = await tx.declarationDocument.findFirst({
      where: {
        id: documentId,
        studentId: actor.studentId,
        status: 'ISSUED',
        origin: 'STUDENT_REQUEST',
        snapshotVersion: { in: [2, 3] },
      },
      select: {
        snapshotVersion: true,
        archiveSha256: true,
        sourcePdfSha256: true,
        sourcePdfPage: true,
        requests: { select: { id: true }, take: 1 },
      },
    });
    if (
      !document?.archiveSha256 ||
      document.sourcePdfPage !== 1 ||
      !document.requests.length
    )
      throw new PdfArchiveError('Arquivo indisponível.', 404);
    const file = await tx.declarationPdfArchive.findUnique({
      where: { sha256: document.archiveSha256 },
    });
    if (
      !file ||
      file.pageCount !== 1 ||
      file.templateVersion !==
        (document.snapshotVersion === 3
          ? 'vinculo-a4-qr-v1'
          : 'minuta-a4-qr-v1') ||
      file.sha256 !== document.sourcePdfSha256 ||
      !file.bytes.byteLength ||
      file.bytes.byteLength > PDF_ARCHIVE_MAX_BYTES ||
      createHash('sha256').update(file.bytes).digest('hex') !== file.sha256
    )
      throw new PdfArchiveError(
        'Não foi possível conferir o arquivo original.',
        503,
      );
    return file;
  });
}
