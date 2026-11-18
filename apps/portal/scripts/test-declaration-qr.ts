import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createDeclarationPdf } from '../src/lib/declaration-pdf';
import { issuanceContent } from '../src/lib/declaration-issuance-input';
import { verificationLink } from '../src/lib/public-verification-input';
import { qrPattern } from '../src/lib/declaration-qr';
import { subsequentFixture } from './subsequent-declaration-fixture';
import { syntheticEnrollmentValidity } from './enrollment-fixture';

const run = promisify(execFile);
async function main() {
  const explicit = process.env.TEST_QR_OUTPUT_DIR;
  const output = explicit
    ? path.resolve(explicit)
    : await mkdtemp(path.join(tmpdir(), 'ete-qr-check-'));
  if (explicit) await mkdir(output); // Exige diretório novo: não sobrescreve arquivos locais.
  try {
    const fixture = subsequentFixture('DS', 1);
    for (const purpose of ['PREVIEW', 'SCHOOL'] as const)
      for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
        const e =
          mode === 'SUBSEQUENTE'
            ? fixture.enrollment
            : {
                ...fixture.enrollment,
                mode: 'INTEGRADO' as const,
                grade: 2,
                courseLabel: 'DS',
                moduleNumber: null,
                offeringId: null,
                offering: null,
                calendarModule: null,
                calendarRevision: null,
                ...syntheticEnrollmentValidity(),
              };
        const student = {
          ...fixture.student,
          fullName:
            mode === 'INTEGRADO'
              ? 'Aluno Fictício do Integrado'
              : 'Aluno Fictício do Subsequente',
          details: {
            parentOne: 'Filiação fictícia',
            parentTwo: null,
            socialName: null,
            birthCity: 'Recife',
            birthState: 'PE',
            birthCountry: 'BR',
            birthplaceSource: 'SCHOOL_RECORD' as const,
          },
          enrollments: [e],
        };
        const content = issuanceContent(student, e.id, purpose),
          code = randomBytes(32).toString('base64url');
        const verification = {
          code,
          url: verificationLink(code, 'https://portal.example.invalid'),
          ...(purpose === 'SCHOOL' ? { purpose: 'SCHOOL' as const } : {}),
        };
        const pattern = qrPattern(verification);
        assert.ok(pattern.getModuleCount() <= 49);
        const bytes = await createDeclarationPdf(
          content.student,
          content.fields,
          verification,
        );
        const pdf = await PDFDocument.load(bytes);
        assert.equal(pdf.getPageCount(), 1);
        const target = path.join(
          output,
          mode.toLowerCase() + '-' + purpose.toLowerCase(),
        );
        await writeFile(target + '.pdf', bytes, { flag: 'wx' });
        await run(
          'pdftoppm',
          ['-r', '150', '-singlefile', '-png', target + '.pdf', target],
          { timeout: 30000, maxBuffer: 1024 * 1024 },
        );
        const { data, info } = await sharp(await readFile(target + '.png'))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const decoded = jsQR(
          new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          info.width,
          info.height,
          { inversionAttempts: 'dontInvert' },
        );
        assert.equal(
          decoded?.data,
          verification.url,
          'O QR renderizado no PDF precisa devolver o endereço e o código exatos.',
        );
        const scale = 150 / 72;
        for (const corner of [
          decoded!.location.topLeftCorner,
          decoded!.location.bottomRightCorner,
        ]) {
          assert.ok(
            corner.x >= 45 * scale - 2 && corner.x <= (45 + 54) * scale + 2,
          );
          assert.ok(
            corner.y >= info.height - (84 + 54) * scale - 2 &&
              corner.y <= info.height - 84 * scale + 2,
          );
        }
        await writeFile(
          target + '-scan.json',
          JSON.stringify(
            { mode, purpose, code, url: decoded!.data, dpi: 150, pages: 1 },
            null,
            2,
          ),
          { flag: 'wx' },
        );
      }
    console.log(
      'OK: quatro PDFs A4 renderizados a150dpi, QR decodificado por implementação independente no espaço reservado, endereço/código exatos.',
    );
    if (explicit)
      console.log('Modelos fictícios e capturas para revisão: ' + output);
  } finally {
    if (!explicit) await rm(output, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error(
    'Falha no teste sintético de QR/PDF. Confira Poppler e a renderização no ambiente de teste.',
  );
  process.exitCode = 1;
});
