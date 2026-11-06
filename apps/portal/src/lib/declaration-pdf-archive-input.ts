import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { DeclarationValidationError } from './declarations';

export const PDF_ARCHIVE_MAX_BYTES = 16 * 1024 * 1024;

// Recebe apenas PDFs do gerador interno; não é um importador de arquivos do aluno.
export async function preparePdfArchive(
  pdf: Uint8Array,
  expectedPages: number,
) {
  if (
    !Number.isInteger(expectedPages) ||
    expectedPages < 1 ||
    expectedPages > 100 ||
    !pdf.byteLength ||
    pdf.byteLength > PDF_ARCHIVE_MAX_BYTES ||
    Buffer.from(pdf.subarray(0, 5)).toString('ascii') !== '%PDF-'
  )
    throw new DeclarationValidationError(
      'Arquivo PDF indisponível para guarda.',
    );
  const bytes = Uint8Array.from(pdf);
  try {
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });
    if (parsed.isEncrypted || parsed.getPageCount() !== expectedPages)
      throw new Error('PDF incompatível.');
  } catch {
    throw new DeclarationValidationError(
      'Arquivo PDF indisponível para guarda.',
    );
  }
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    pageCount: expectedPages,
    templateVersion: 'minuta-a4-v1',
  };
}
