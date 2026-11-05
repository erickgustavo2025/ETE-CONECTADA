import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { subsequentFixture } from './subsequent-declaration-fixture';
import { issueTestDeclaration } from '../src/lib/declaration-issuance';
import { changeDeclarationDocument } from '../src/lib/declaration-document-actions';
import { readArchivedDeclarationPdf } from '../src/lib/declaration-pdf-archive';
import { searchDocuments } from '../src/lib/document-search';

async function main() {
  const previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment();
  const { db } = env;
  const ids: string[] = [],
    offerings: string[] = [];
  try {
    async function member(role: 'student' | 'secretary') {
      const student = await db.student.create({
        data: {
          fullName: 'Pessoa fictícia ' + randomUUID(),
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
      ids.push(student.id);
      const account = await db.account.create({
        data: {
          studentId: student.id,
          email: randomUUID() + '@example.invalid',
          passwordHash: 'ficticio',
          status: 'active',
          role,
        },
      });
      return { student, account };
    }
    const staff = await member('secretary'),
      a = await member('student'),
      b = await member('student');
    const enrollment = await db.enrollment.create({
      data: {
        studentId: a.student.id,
        mode: 'INTEGRADO',
        className: 'Turma fictícia A',
        grade: 2,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const other = await db.enrollment.create({
      data: {
        studentId: b.student.id,
        mode: 'INTEGRADO',
        className: 'Turma fictícia B',
        grade: 1,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const scope = {
      enrollmentId_documentType: {
        enrollmentId: enrollment.id,
        documentType: 'DECLARACAO_VINCULO',
      },
    };
    const key = randomUUID();
    const initialCalls = await Promise.all(
      Array.from({ length: 4 }, () =>
        issueTestDeclaration(a.account.id, {
          enrollmentId: enrollment.id,
          requestKey: key,
        }),
      ),
    );
    assert.equal(initialCalls.filter((r) => r.created).length, 1);
    assert.equal(new Set(initialCalls.map((r) => r.document.id)).size, 1);
    const first = initialCalls.find((r) => r.created)!;
    assert.equal(first.created, true);
    assert.equal(first.document.state, 'ISSUED');
    assert.equal(first.document.testOnly, true);
    const original = await readArchivedDeclarationPdf(
      db,
      staff.account.id,
      first.document.id,
    );
    assert.ok(original.bytes.byteLength > 0);
    await db.student.update({
      where: { id: a.student.id },
      data: { fullName: 'Nome corrigido fictício' },
    });
    const repeated = await Promise.all(
      Array.from({ length: 4 }, () =>
        issueTestDeclaration(a.account.id, {
          enrollmentId: enrollment.id,
          requestKey: key,
        }),
      ),
    );
    assert.ok(
      repeated.every((r) => !r.created && r.document.id === first.document.id),
    );
    assert.deepEqual(
      Buffer.from(
        (
          await readArchivedDeclarationPdf(
            db,
            staff.account.id,
            first.document.id,
          )
        ).bytes,
      ),
      Buffer.from(original.bytes),
    );
    await assert.rejects(
      issueTestDeclaration(a.account.id, {
        enrollmentId: other.id,
        requestKey: key,
      }),
    );
    await assert.rejects(
      issueTestDeclaration(a.account.id, {
        enrollmentId: other.id,
        requestKey: randomUUID(),
      }),
    );
    await assert.rejects(
      issueTestDeclaration(staff.account.id, {
        enrollmentId: enrollment.id,
        requestKey: randomUUID(),
      }),
    );
    const second = await issueTestDeclaration(a.account.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    assert.equal(second.created, true);
    const event = await db.declarationDocumentAction.findUniqueOrThrow({
      where: { documentId: first.document.id },
    });
    assert.equal(event.action, 'SUPERSEDED');
    assert.equal(event.successorId, second.document.id);
    assert.equal(event.createdById, a.account.id);
    assert.equal(
      (await db.declarationCurrentIssue.findUniqueOrThrow({ where: scope }))
        .documentId,
      second.document.id,
    );
    const query = await searchDocuments({
      studentId: a.student.id,
      status: 'ISSUED',
    });
    assert.ok('documents' in query);
    assert.equal(query.documents.length, 1);
    assert.equal(query.documents[0].state, 'ISSUED');
    const drafts = await searchDocuments({
      studentId: a.student.id,
      status: 'DRAFT',
    });
    assert.ok('documents' in drafts);
    assert.equal(drafts.documents.length, 0);

    // Falha na última escrita: documento, bytes e substituição anterior voltam juntos.
    const count = await db.declarationDocument.count(),
      files = await db.declarationPdfArchive.count();
    await db.student.update({
      where: { id: a.student.id },
      data: { fullName: 'Nome diferente para arquivo de rollback' },
    });
    await db.$executeRaw`CREATE FUNCTION ec095_fail_current() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintética final'; END; $$`;
    await db.$executeRaw`CREATE TRIGGER ec095_failure BEFORE UPDATE ON declaration_current_issues FOR EACH ROW EXECUTE FUNCTION ec095_fail_current()`;
    try {
      await assert.rejects(
        issueTestDeclaration(a.account.id, {
          enrollmentId: enrollment.id,
          requestKey: randomUUID(),
        }),
      );
      assert.equal(await db.declarationDocument.count(), count);
      assert.equal(await db.declarationPdfArchive.count(), files);
      assert.equal(
        await db.declarationDocumentAction.count({
          where: { documentId: second.document.id },
        }),
        0,
      );
      assert.equal(
        (await db.declarationCurrentIssue.findUniqueOrThrow({ where: scope }))
          .documentId,
        second.document.id,
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER ec095_failure ON declaration_current_issues`;
      await db.$executeRaw`DROP FUNCTION ec095_fail_current()`;
    }
    await changeDeclarationDocument(
      {
        documentId: second.document.id,
        action: 'CANCELLED',
        reason: 'Cancelamento fictício',
        successorId: null,
      },
      staff.account.id,
    );
    const next = await issueTestDeclaration(a.account.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    assert.equal(
      (
        await db.declarationDocumentAction.findUniqueOrThrow({
          where: { documentId: second.document.id },
        })
      ).action,
      'CANCELLED',
    );
    assert.equal(
      (await db.declarationCurrentIssue.findUniqueOrThrow({ where: scope }))
        .documentId,
      next.document.id,
    );
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () =>
        issueTestDeclaration(a.account.id, {
          enrollmentId: enrollment.id,
          requestKey: randomUUID(),
        }),
      ),
    );
    assert.equal(new Set(concurrent.map((r) => r.document.id)).size, 3);
    assert.equal(
      await db.declarationDocument.count({
        where: {
          enrollmentId: enrollment.id,
          status: 'ISSUED',
          terminalActions: { none: {} },
        },
      }),
      1,
    );

    // O mesmo UUID de pedido de outra conta não reutiliza o documento do primeiro aluno.
    const independent = await issueTestDeclaration(b.account.id, {
      enrollmentId: other.id,
      requestKey: key,
    });
    assert.notEqual(independent.document.id, first.document.id);
    await assert.rejects(
      db.declarationCurrentIssue.update({
        where: scope,
        data: { documentId: independent.document.id },
      }),
      'Ponteiro atual não pode cruzar aluno ou matrícula.',
    );
    const legacy = await db.declarationDocument.create({
      data: {
        id: randomUUID(),
        publicCode: randomUUID().replaceAll('-', '') + 'abcdefghijk',
        studentId: a.student.id,
        enrollmentId: enrollment.id,
        createdById: staff.account.id,
        snapshot: {
          type: 'DECLARACAO_VINCULO',
          body: 'Minuta antiga fictícia',
        },
        sourcePdfSha256: 'a'.repeat(64),
        sourcePdfPage: 1,
      },
    });
    await assert.rejects(
      db.declarationCurrentIssue.update({
        where: scope,
        data: { documentId: legacy.id },
      }),
      'Minuta não pode virar documento atual emitido.',
    );

    const sub = subsequentFixture('ENF', 2);
    const offering = await db.courseOffering.create({
      data: {
        id: sub.enrollment.offeringId,
        label: 'Turma fictícia ENF',
        courseLabel: 'ENF',
        calendars: {
          create: {
            revision: 1,
            schedule: sub.schedule,
            createdById: staff.account.id,
          },
        },
      },
    });
    offerings.push(offering.id);
    const { id: subId, offering: ignored, ...subFields } = sub.enrollment;
    void ignored;
    await db.enrollment.create({
      data: { ...subFields, id: subId, studentId: b.student.id },
    });
    const issuedSub = await issueTestDeclaration(b.account.id, {
      enrollmentId: subId,
      requestKey: randomUUID(),
    });
    const subDocument = await db.declarationDocument.findUniqueOrThrow({
      where: { id: issuedSub.document.id },
    });
    const snapshot = subDocument.snapshot as {
      body: string;
      testOnly: boolean;
    };
    assert.ok(!snapshot.body.includes('frequência'));
    assert.ok(snapshot.body.includes('2º módulo'));
    assert.equal(snapshot.testOnly, true);
    await db.account.update({
      where: { id: a.account.id },
      data: { role: 'secretary' },
    });
    await assert.rejects(
      issueTestDeclaration(a.account.id, {
        enrollmentId: enrollment.id,
        requestKey: key,
      }),
    );
    process.env.DECLARATION_REGISTRY_PREVIEW = 'false';
    await assert.rejects(
      issueTestDeclaration(b.account.id, {
        enrollmentId: other.id,
        requestKey: randomUUID(),
      }),
    );
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    console.log(
      'OK: emissão de teste individual, repetição/concorrência, isolamento, dados do banco, cancelamento, substituição atômica, rollback de bytes e histórico, integrado e subsequente.',
    );
  } finally {
    try {
      await db.declarationCurrentIssue.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationPdfArchive.deleteMany({
        where: { documents: { none: {} } },
      });
      await db.student.deleteMany({ where: { id: { in: ids } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offerings } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offerings } } });
    } finally {
      await env.close();
      if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousOrigin;
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    }
  }
}
main().catch(reportTestFailure);
