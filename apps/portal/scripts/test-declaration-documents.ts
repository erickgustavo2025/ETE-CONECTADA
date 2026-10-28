import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { subsequentFixture } from './subsequent-declaration-fixture';
import {
  declarationStudent,
  validateDeclarationFields,
} from '../src/lib/declarations';
import {
  prepareDeclarationDocuments,
  documentInsertData,
} from '../src/lib/declaration-documents';
import {
  recordGeneratedDeclarations,
  RequestError,
} from '../src/lib/declaration-requests';

async function main() {
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const students: string[] = [];
  const offerings: string[] = [];
  const post = (path: string, body: unknown, cookie = '', origin = base) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  async function account(studentId: string, role: 'student' | 'secretary') {
    const row = await db.account.create({
      data: {
        studentId,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'hash-ficticio',
        status: 'active',
        role,
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: row.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: row.id, cookie: 'ete_portal_session=' + token };
  }
  try {
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia do registro',
        birthDate: new Date('1990-01-01T00:00:00Z'),
      },
    });
    students.push(staff.id);
    const actor = await account(staff.id, 'secretary');
    const fixture = subsequentFixture('DS', 2);
    await db.courseOffering.create({
      data: {
        id: fixture.enrollment.offeringId,
        label: fixture.schedule.label,
        courseLabel: 'DS',
        calendars: {
          create: {
            revision: 1,
            schedule: fixture.schedule,
            createdById: actor.id,
          },
        },
      },
    });
    offerings.push(fixture.enrollment.offeringId);
    const { offering, ...subEnrollment } = fixture.enrollment;
    void offering;
    for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
      const student = await db.student.create({
        data: {
          fullName: 'Aluno fictício do registro ' + mode,
          birthDate: new Date('2008-01-01T00:00:00Z'),
          details: {
            create: {
              birthCity: 'Recife',
              birthState: 'PE',
              birthCountry: 'BR',
              birthplaceSource: 'SCHOOL_RECORD',
              parentOne: 'Responsável fictício',
              parentageSource: 'SCHOOL_RECORD',
            },
          },
          enrollments: {
            create:
              mode === 'INTEGRADO'
                ? {
                    mode,
                    className: '1A DS',
                    grade: 1,
                    courseLabel: 'DS',
                    ...syntheticEnrollmentValidity(),
                  }
                : subEnrollment,
          },
        },
      });
      students.push(student.id);
    }
    const members = await Promise.all(
      students.slice(1).map(async (id) => (await declarationStudent(db, id))!),
    );
    const bodies = members.map((student) => ({
      studentId: student.id,
      enrollmentId: student.enrollments[0].id,
      schoolPeriod: student.enrollments[0].periodLabel!,
      courseName: 'Desenvolvimento de Sistemas',
      naturality: 'Recife/PE',
      parentOne: 'Responsável fictício',
      reviewed: true,
    }));
    const entries = members.map((student, index) => ({
      student,
      fields: validateDeclarationFields(bodies[index]),
    }));
    const [row] = documentInsertData(
      prepareDeclarationDocuments([entries[0]]),
      Buffer.from('%PDF-ficticio'),
      actor.id,
    );
    await assert.rejects(
      db.declarationDocument.create({
        data: { ...row, studentId: members[1].id },
      }),
      'Banco deve recusar aluno e matrícula de pessoas diferentes.',
    );
    console.log('OK: vínculo composto protege aluno e matrícula.');
    const studentActor = await account(members[0].id, 'student');
    assert.equal(
      (await post('/api/secretaria/declaracao', bodies[0])).status,
      401,
    );
    assert.equal(
      (await post('/api/secretaria/declaracao', bodies[0], studentActor.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          bodies[0],
          actor.cookie,
          'https://example.invalid',
        )
      ).status,
      403,
    );
    assert.equal(await db.declarationDocument.count(), 0);
    for (const student of members)
      await db.declarationRequest.create({
        data: {
          studentId: student.id,
          enrollmentId: student.enrollments[0].id,
        },
      });
    const single = await post(
      '/api/secretaria/declaracao',
      bodies[0],
      actor.cookie,
    );
    assert.equal(single.status, 200);
    assert.match(single.headers.get('cache-control') ?? '', /no-store/);
    const bytes = Buffer.from(await single.arrayBuffer());
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    const saved = await db.declarationDocument.findFirstOrThrow({
      where: { studentId: members[0].id },
    });
    assert.equal(
      saved.sourcePdfSha256,
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.equal(saved.sourcePdfPage, 1);
    assert.equal(saved.status, 'DRAFT');
    assert.equal(saved.createdById, actor.id);
    assert.match(saved.publicCode, /^[A-Za-z0-9_-]{43}$/);
    const originalSnapshot = saved.snapshot;
    await assert.rejects(
      db.declarationDocument.update({
        where: { id: saved.id },
        data: { sourcePdfPage: 2 },
      }),
    );
    await assert.rejects(
      db.declarationDocument.update({
        where: { id: saved.id },
        data: { status: 'ISSUED' },
      }),
    );
    await assert.rejects(db.student.delete({ where: { id: members[0].id } }));
    await assert.rejects(
      db.enrollment.delete({ where: { id: members[0].enrollments[0].id } }),
    );
    await assert.rejects(db.account.delete({ where: { id: actor.id } }));
    await db.student.update({
      where: { id: members[0].id },
      data: { fullName: 'Nome cadastral corrigido fictício' },
    });
    await db.studentDetails.update({
      where: { studentId: members[0].id },
      data: { parentOne: 'Outra filiação fictícia' },
    });
    assert.deepEqual(
      (
        await db.declarationDocument.findUniqueOrThrow({
          where: { id: saved.id },
        })
      ).snapshot,
      originalSnapshot,
    );
    const batch = await post(
      '/api/secretaria/declaracoes',
      { items: bodies },
      actor.cookie,
    );
    assert.equal(batch.status, 200);
    const batchBytes = Buffer.from(await batch.arrayBuffer());
    assert.equal((await PDFDocument.load(batchBytes)).getPageCount(), 2);
    const batchHash = createHash('sha256').update(batchBytes).digest('hex');
    const records = await db.declarationDocument.findMany({
      where: { sourcePdfSha256: batchHash },
      orderBy: { sourcePdfPage: 'asc' },
    });
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map((x) => [x.studentId, x.enrollmentId, x.sourcePdfPage]),
      members.map((student, index) => [
        student.id,
        student.enrollments[0].id,
        index + 1,
      ]),
    );
    assert.equal(new Set(records.map((x) => x.publicCode)).size, 2);
    const count = await db.declarationDocument.count();
    const before = await db.declarationRequest.findMany({
      orderBy: { id: 'asc' },
    });
    const invalid = await post(
      '/api/secretaria/declaracoes',
      { items: [bodies[0], { ...bodies[1], parentOne: '\u0001' }] },
      actor.cookie,
    );
    assert.equal(invalid.status, 422);
    assert.equal(await db.declarationDocument.count(), count);
    assert.deepEqual(
      await db.declarationRequest.findMany({ orderBy: { id: 'asc' } }),
      before,
    );
    // Uma falha depois de inserir o documento deve desfazer também o registro.
    await db.$executeRaw`CREATE FUNCTION ec095_reject_request_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintética posterior ao registro'; END; $$`;
    await db.$executeRaw`CREATE TRIGGER ec095_request_failure BEFORE UPDATE ON declaration_requests FOR EACH ROW EXECUTE FUNCTION ec095_reject_request_update()`;
    try {
      assert.equal(
        (await post('/api/secretaria/declaracao', bodies[0], actor.cookie))
          .status,
        503,
      );
      assert.equal(await db.declarationDocument.count(), count);
      assert.deepEqual(
        await db.declarationRequest.findMany({ orderBy: { id: 'asc' } }),
        before,
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER ec095_request_failure ON declaration_requests`;
      await db.$executeRaw`DROP FUNCTION ec095_reject_request_update()`;
    }
    const generated = members.map((student) => ({
      studentId: student.id,
      enrollmentId: student.enrollments[0].id,
      periodLabel: student.enrollments[0].periodLabel!,
      reviewedAt: student.enrollments[0].reviewedAt,
      calendarRevision: student.enrollments[0].calendarRevision,
    }));
    await assert.rejects(
      recordGeneratedDeclarations(generated, actor.id, {
        records: prepareDeclarationDocuments(entries).reverse(),
        pdf: batchBytes,
      }),
    );
    await db.account.update({
      where: { id: actor.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      recordGeneratedDeclarations(generated, actor.id, {
        records: prepareDeclarationDocuments(entries),
        pdf: batchBytes,
      }),
      (error) => error instanceof RequestError && error.status === 403,
    );
    await db.account.update({
      where: { id: actor.id },
      data: { role: 'secretary' },
    });
    await db.enrollment.update({
      where: { id: members[0].enrollments[0].id },
      data: { reviewedAt: new Date() },
    });
    await assert.rejects(
      recordGeneratedDeclarations(generated, actor.id, {
        records: prepareDeclarationDocuments(entries),
        pdf: batchBytes,
      }),
    );
    assert.equal(await db.declarationDocument.count(), count);
    const studentView = await fetch(base + '/api/declaracao/solicitacoes', {
      headers: { Cookie: studentActor.cookie },
    });
    const view = await studentView.text();
    assert.equal(studentView.status, 200);
    for (const secret of [
      saved.publicCode,
      saved.sourcePdfSha256,
      'Responsável fictício',
      'RESPONSÁVEL FICTÍCIO',
    ])
      assert.ok(!view.includes(secret));
    console.log(
      'OK: registro privado individual e lote integrado/subsequente, hash/página, snapshot imutável, restrições de exclusão, papéis/origem, revogação, revisão concorrente e rollback integral.',
    );
  } finally {
    try {
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: students } },
      });
      await db.student.deleteMany({ where: { id: { in: students } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offerings } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offerings } } });
    } finally {
      await environment.close();
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    }
  }
}
main().catch(reportTestFailure);
