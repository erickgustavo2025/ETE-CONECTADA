import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';
import { declarationRegistryPreviewEnabled } from './declaration-documents';
import { PDF_ARCHIVE_MAX_BYTES } from './declaration-pdf-archive-input';

export class PdfArchiveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Nesta fatia só a secretaria lê arquivos, inclusive lotes com vários alunos.
// O código público nunca serve de autorização. Download individual virá na073.
export async function readArchivedDeclarationPdf(
  db: PrismaClient,
  accountId: string,
  documentId: string,
) {
  if (!declarationRegistryPreviewEnabled())
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
