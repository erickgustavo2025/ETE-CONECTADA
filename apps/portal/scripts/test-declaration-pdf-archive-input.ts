import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import {
  preparePdfArchive,
  PDF_ARCHIVE_MAX_BYTES,
} from '../src/lib/declaration-pdf-archive-input';

async function main() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const archive = await preparePdfArchive(bytes, 1);
  assert.equal(
    archive.sha256,
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.deepEqual(Buffer.from(archive.bytes), Buffer.from(bytes));
  assert.equal(archive.pageCount, 1);
  assert.equal(archive.templateVersion, 'minuta-a4-v1');
  await assert.rejects(preparePdfArchive(bytes, 2));
  await assert.rejects(preparePdfArchive(bytes, 0));
  await assert.rejects(preparePdfArchive(bytes, 101));
  await assert.rejects(preparePdfArchive(new Uint8Array(), 1));
  await assert.rejects(preparePdfArchive(Buffer.from('%PDF-invalido'), 1));
  await assert.rejects(
    preparePdfArchive(new Uint8Array(PDF_ARCHIVE_MAX_BYTES + 1), 1),
  );
  // Não reter uma referência mutável ao buffer do chamador.
  bytes[0] = 0;
  assert.equal(archive.bytes[0], 37);
  console.log(
    'OK: arquivo PDF limitado, completo, imutável por cópia e identificado por hash.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
