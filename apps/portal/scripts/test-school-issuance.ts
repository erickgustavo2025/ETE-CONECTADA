import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { subsequentFixture } from './subsequent-declaration-fixture';
import { issueDeclaration } from '../src/lib/declaration-issuance';
import { readStudentDeclarationPdf } from '../src/lib/declaration-pdf-archive';
import { readPublicVerification } from '../src/lib/public-verification';
import { changeDeclarationDocument } from '../src/lib/declaration-document-actions';
import { isPublicVerification } from '../src/lib/public-verification-types';

async function main() {
  const env = await openTestEnvironment();
  const { db } = env;
  const previous = { ...process.env };
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  delete process.env.DECLARATION_ISSUANCE_MODE;
  try {
    async function member(role: 'student' | 'secretary') {
      const s = await db.student.create({
        data: {
          fullName: 'Pessoa fictícia emissão ' + randomUUID(),
          birthDate: new Date('2000-01-01'),
          details: {
            create: {
              parentOne: 'Filiação fictícia',
              parentageSource: 'SCHOOL_RECORD',
              birthCity: 'Recife',
              birthState: 'PE',
              birthCountry: 'BR',
              birthplaceSource: 'SCHOOL_RECORD',
            },
          },
        },
      });
      const a = await db.account.create({
        data: {
          studentId: s.id,
          email: randomUUID() + '@example.invalid',
          passwordHash: 'fixture-not-used',
          status: 'active',
          role,
        },
      });
      return { s, a };
    }
    const staff = await member('secretary');
    for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
      const pupil = await member('student');
      let enrollmentId: string;
      if (mode === 'INTEGRADO') {
        enrollmentId = (
          await db.enrollment.create({
            data: {
              studentId: pupil.s.id,
              mode,
              className: '2A DS fictícia',
              grade: 2,
              courseLabel: 'DS',
              ...syntheticEnrollmentValidity(),
            },
          })
        ).id;
      } else {
        const f = subsequentFixture('ENF', 2);
        await db.courseOffering.create({
          data: {
            id: f.enrollment.offeringId,
            label: 'Turma fictícia ENF',
            courseLabel: 'ENF',
            calendars: {
              create: {
                revision: 1,
                schedule: f.schedule,
                createdById: staff.a.id,
              },
            },
          },
        });
        const { offering: ignored, ...data } = f.enrollment;
        void ignored;
        enrollmentId = (
          await db.enrollment.create({
            data: { ...data, studentId: pupil.s.id },
          })
        ).id;
      }
      delete process.env.DECLARATION_ISSUANCE_MODE;
      const oldKey = randomUUID();
      const old = await issueDeclaration(pupil.a.id, {
        enrollmentId,
        requestKey: oldKey,
      });
      const oldRow = await db.declarationDocument.findUniqueOrThrow({
        where: { id: old.document.id },
      });
      const oldBytes = await readStudentDeclarationPdf(
        db,
        pupil.a.id,
        old.document.id,
      );
      assert.equal(old.document.testOnly, true);
      process.env.DECLARATION_ISSUANCE_MODE = 'school';
      const requestKey = randomUUID();
      const first = await issueDeclaration(pupil.a.id, {
        enrollmentId,
        requestKey,
      });
      assert.equal(first.document.testOnly, false);
      const row = await db.declarationDocument.findUniqueOrThrow({
        where: { id: first.document.id },
      });
      assert.equal(row.snapshotVersion, 3);
      for (const invalid of [
        { testOnly: true },
        { testOnly: 'false' },
        { issuanceMode: 'PREVIEW' },
        { issuanceMode: null },
      ]) {
        await assert.rejects(
          db.declarationDocument.create({
            data: {
              ...row,
              id: randomUUID(),
              publicCode: randomBytes(32).toString('base64url'),
              requestKey: randomUUID(),
              snapshot: {
                ...(row.snapshot as Record<string, string | boolean>),
                ...invalid,
              },
            },
          }),
        );
      }

      assert.equal((row.snapshot as { testOnly: boolean }).testOnly, false);
      const file = await readStudentDeclarationPdf(db, pupil.a.id, row.id);
      assert.equal(file.templateVersion, 'vinculo-a4-qr-v1');
      assert.equal(
        (await PDFDocument.load(file.bytes)).getTitle(),
        'Declaração de vínculo',
      );
      const text = spawnSync('pdftotext', ['-', '-'], {
        input: file.bytes,
        encoding: 'utf8',
      });
      assert.equal(text.status, 0);
      assert.doesNotMatch(
        text.stdout,
        /TESTE|MINUTA|sem validade oficial|Verificação de teste/i,
      );
      assert.match(text.stdout, /Verificação:/);
      assert.match(text.stdout, new RegExp(first.document.publicCode));
      const publicRow = await readPublicVerification(
        first.document.publicCode,
        null,
      );
      assert.ok(isPublicVerification(publicRow));
      assert.equal(publicRow.testOnly, false);
      assert.equal(publicRow.state, 'VALID');
      assert.ok(!JSON.stringify(publicRow).includes('Filiação fictícia'));
      assert.ok(!Object.hasOwn(publicRow, 'snapshot'));
      const legacyPublic = await readPublicVerification(
        old.document.publicCode,
        null,
      );
      assert.equal(legacyPublic?.testOnly, true);
      assert.equal(legacyPublic?.state, 'SUPERSEDED');
      assert.deepEqual(
        (
          await db.declarationDocument.findUniqueOrThrow({
            where: { id: old.document.id },
          })
        ).snapshot,
        oldRow.snapshot,
      );
      assert.deepEqual(
        (await readStudentDeclarationPdf(db, pupil.a.id, old.document.id))
          .bytes,
        oldBytes.bytes,
      );
      assert.equal(
        (
          await issueDeclaration(pupil.a.id, {
            enrollmentId,
            requestKey: oldKey,
          })
        ).document.testOnly,
        true,
      );
      assert.equal(
        (await issueDeclaration(pupil.a.id, { enrollmentId, requestKey }))
          .created,
        false,
      );
      const next = await issueDeclaration(pupil.a.id, {
        enrollmentId,
        requestKey: randomUUID(),
      });
      assert.equal(
        (await readPublicVerification(first.document.publicCode, null))?.state,
        'SUPERSEDED',
      );
      await changeDeclarationDocument(
        {
          documentId: next.document.id,
          action: 'CANCELLED',
          reason: 'Cancelamento fictício conferido.',
          successorId: null,
        },
        staff.a.id,
      );
      assert.equal(
        (await readPublicVerification(next.document.publicCode, null))?.state,
        'CANCELLED',
      );
      await db.student.update({
        where: { id: pupil.s.id },
        data: { issuanceBlocked: true },
      });
      await assert.rejects(
        issueDeclaration(pupil.a.id, {
          enrollmentId,
          requestKey: randomUUID(),
        }),
      );
      await assert.rejects(readStudentDeclarationPdf(db, staff.a.id, row.id));
      console.log(
        'OK: emissão escolar ' +
          mode +
          ', arquivo/QR/estados e amostra anterior preservados.',
      );
    }
    process.env.PORTAL_PUBLIC_URL = 'http://public.example';
    await assert.rejects(
      issueDeclaration(staff.a.id, {
        enrollmentId: randomUUID(),
        requestKey: randomUUID(),
      }),
    );
  } finally {
    await env.close();
    for (const key of [
      'PORTAL_PUBLIC_URL',
      'DECLARATION_REGISTRY_PREVIEW',
      'DECLARATION_ISSUANCE_MODE',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
main().catch(reportTestFailure);
