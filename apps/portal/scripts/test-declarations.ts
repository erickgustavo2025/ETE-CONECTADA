import { syntheticEnrollmentValidity } from './enrollment-fixture';
import assert from 'node:assert/strict';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { parseStudentBackup } from '../src/lib/student-import';
import { hashPassword } from '../src/lib/password';
import {
  validateDeclarationFields,
  DeclarationValidationError,
} from '../src/lib/declarations';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const suffix = randomBytes(8).toString('hex');
  const created: string[] = [];
  const cookie = async (studentId: string, role: 'student' | 'secretary') => {
    const account = await db.account.create({
      data: {
        studentId,
        role,
        status: 'active',
        passwordHash: await hashPassword(randomBytes(16).toString('hex')),
        email: `${role}-${studentId}-${suffix}@eteconectada.invalid`,
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        accountId: account.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return `ete_portal_session=${token}`;
  };
  const post = (url: string, body: unknown, session?: string, origin = base) =>
    fetch(`${base}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(session ? { Cookie: session } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const parse = parseStudentBackup([
      {
        _id: { $oid: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
        matricula: '9900099',
        nome: 'Aluno sintético',
        dataNascimento: '15/01/2008',
        turma: '2B DS',
        senha: 'não importar',
        role: 'admin',
        email: 'nao-importar@example.invalid',
      },
    ]);
    assert.equal(parse[0].courseLabel, 'DS');
    assert.equal('senha' in parse[0], false);
    assert.equal('email' in parse[0], false);
    assert.equal('role' in parse[0], false);
    assert.throws(() =>
      parseStudentBackup([
        {
          _id: { $oid: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
          matricula: '9900099',
          nome: 'Aluno sintético',
          dataNascimento: '31/02/2008',
          turma: '2B DS',
        },
      ]),
    );
    const student = await db.student.create({
      data: {
        fullName: `Estudante fictício João D'Ávila ${suffix}`,
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15T00:00:00Z'),
        details: {
          create: {
            birthCity: 'Recife',
            birthState: 'PE',
            birthCountry: 'BR',
            birthplaceSource: 'SCHOOL_RECORD',
            parentOne: 'Responsável sintético Um',
            parentTwo: 'Responsável sintético Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            ...syntheticEnrollmentValidity(),
            className: '2B DS',
            grade: 2,
            courseLabel: 'DS',
          },
        },
      },
      include: { enrollments: true },
    });
    created.push(student.id);
    const staff = await db.student.create({
      data: {
        fullName: 'Responsável sintético de teste',
        birthDate: new Date('1990-01-01T00:00:00Z'),
        enrollments: {
          create: {
            mode: 'SUBSEQUENTE',
            className: 'Teste subsequente',
            courseLabel: 'DS',
          },
        },
      },
      include: { enrollments: true },
    });
    created.push(staff.id);
    const studentCookie = await cookie(student.id, 'student');
    const staffCookie = await cookie(staff.id, 'secretary');
    assert.equal((await fetch(`${base}/api/declaracao/pdf`)).status, 404);
    assert.equal((await fetch(`${base}/api/profile/photo`)).status, 404);
    assert.equal(
      (await fetch(`${base}/api/declaracao/solicitacoes`)).status,
      401,
    );
    assert.equal(
      (
        await post('/api/declaracao/solicitacoes', {
          enrollmentId: student.enrollments[0].id,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await post(
          '/api/declaracao/solicitacoes',
          { enrollmentId: student.enrollments[0].id },
          studentCookie,
          'https://example.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/declaracao/solicitacoes',
          { enrollmentId: staff.enrollments[0].id },
          studentCookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await post(
          '/api/declaracao/solicitacoes',
          { enrollmentId: staff.enrollments[0].id },
          staffCookie,
        )
      ).status,
      422,
    );
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () =>
        post(
          '/api/declaracao/solicitacoes',
          { enrollmentId: student.enrollments[0].id, studentId: staff.id },
          studentCookie,
        ),
      ),
    );
    assert.equal(
      concurrent.filter((response) => response.status === 201).length,
      1,
    );
    assert.ok(
      concurrent.every((response) => [200, 201].includes(response.status)),
    );
    const requestRows = await Promise.all(
      concurrent.map((response) => response.json()),
    );
    const requestId = requestRows[0].request.id;
    assert.ok(requestRows.every((row) => row.request.id === requestId));
    assert.equal(
      await db.declarationRequest.count({ where: { studentId: student.id } }),
      1,
    );
    const ownRequests = await fetch(
      `${base}/api/declaracao/solicitacoes?studentId=${staff.id}`,
      { headers: { Cookie: studentCookie } },
    );
    const ownRows = (await ownRequests.json()).requests;
    assert.equal(ownRows.length, 1);
    assert.equal(ownRows[0].id, requestId);
    assert.equal('student' in ownRows[0], false);
    assert.equal(
      (
        await fetch(`${base}/api/secretaria/solicitacoes`, {
          headers: { Cookie: studentCookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/api/secretaria/solicitacoes`)).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${base}/api/secretaria/solicitacoes?status=INVALID`, {
          headers: { Cookie: staffCookie },
        })
      ).status,
      400,
    );
    const staffRequests = await fetch(`${base}/api/secretaria/solicitacoes`, {
      headers: { Cookie: staffCookie },
    });
    assert.equal(staffRequests.status, 200);
    assert.match(staffRequests.headers.get('cache-control')!, /no-store/);
    assert.ok(
      (await staffRequests.json()).requests.some(
        (row: { id: string }) => row.id === requestId,
      ),
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: requestId, confirmed: true },
          studentCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: requestId, confirmed: true },
          staffCookie,
          'https://example.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: requestId, confirmed: true },
          staffCookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await post('/api/secretaria/alunos', {}, studentCookie)).status,
      403,
    );
    assert.equal((await post('/api/secretaria/alunos', {})).status, 401);
    assert.equal(
      (
        await post(
          '/api/secretaria/alunos',
          {},
          staffCookie,
          'https://example.invalid',
        )
      ).status,
      403,
    );
    const list = await post(
      '/api/secretaria/alunos',
      { query: suffix, page: 9999 },
      staffCookie,
    );
    assert.equal(list.status, 200);
    const result = await list.json();
    assert.equal(result.total, 1);
    assert.equal(result.page, 1);
    assert.equal(result.students.length, 1);
    assert.equal('account' in result.students[0], false);
    const empty = await post(
      '/api/secretaria/alunos',
      { query: `not-found-${suffix}` },
      staffCookie,
    );
    assert.equal((await empty.json()).total, 0);
    const fields = {
      studentId: student.id,
      enrollmentId: student.enrollments[0].id,
      naturality: 'Jaboatão dos Guararapes/PE',
      parentOne: 'Responsável fictício Um',
      parentTwo: 'Responsável fictício Dois',
      socialName: '',
      courseName: 'Desenvolvimento de Sistemas',
      schoolPeriod: '2026',
      schedule: 'de segunda-feira a sexta-feira, das 07h30 às 16h40',
      secretaryName: 'Secretário(a) de teste',
      secretaryRegistration: '',
      directorName: 'Gestor(a) de teste',
      directorRegistration: '',
      includeFrequency: true,
      frequencyPercent: '92,5',
      frequencyStart: '2026-02-01',
      frequencyEnd: '2026-09-30',
      reviewed: true,
    };
    assert.equal(validateDeclarationFields(fields).frequencyPercent, '92.5');
    for (const percent of ['101', '-1', 'abc', '1.234', ''])
      assert.throws(
        () =>
          validateDeclarationFields({ ...fields, frequencyPercent: percent }),
        DeclarationValidationError,
      );
    assert.equal(
      validateDeclarationFields({ ...fields, frequencyPercent: '0' })
        .frequencyPercent,
      '0',
    );
    assert.throws(
      () =>
        validateDeclarationFields({ ...fields, frequencyStart: '2026-02-31' }),
      DeclarationValidationError,
    );
    assert.throws(
      () =>
        validateDeclarationFields({
          ...fields,
          frequencyStart: '2026-10-01',
          frequencyEnd: '2026-09-30',
        }),
      DeclarationValidationError,
    );
    assert.throws(
      () =>
        validateDeclarationFields({ ...fields, frequencyEnd: '2099-01-01' }),
      DeclarationValidationError,
    );
    assert.equal(
      (await post('/api/secretaria/declaracao', fields, studentCookie)).status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          { ...fields, reviewed: false },
          staffCookie,
        )
      ).status,
      422,
    );
    const invalid = await post(
      '/api/secretaria/declaracao',
      { ...fields, naturality: '' },
      staffCookie,
    );
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).field, 'naturality');
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          { ...fields, enrollmentId: staff.enrollments[0].id },
          staffCookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          {
            ...fields,
            studentId: staff.id,
            enrollmentId: staff.enrollments[0].id,
          },
          staffCookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: requestId },
        })
      ).status,
      'REQUESTED',
    );
    for (const data of [
      { status: 'UNCONFIRMED' as const },
      { status: 'ENDED' as const },
      { validFrom: new Date('2090-01-01') },
      { validUntil: new Date('2001-12-31') },
    ]) {
      await db.enrollment.update({
        where: { id: fields.enrollmentId },
        data: { ...syntheticEnrollmentValidity(), ...data },
      });
      for (const [path, body] of [
        ['/api/secretaria/declaracao', fields],
        ['/api/secretaria/declaracoes', { items: [fields] }],
      ] as const) {
        const rejected = await post(path, body, staffCookie);
        assert.equal(
          rejected.status,
          422,
          'Vínculo incompatível não gera PDF.',
        );
        assert.match(rejected.headers.get('content-type')!, /json/);
      }
      assert.equal(
        (
          await db.declarationRequest.findUniqueOrThrow({
            where: { id: requestId },
          })
        ).status,
        'REQUESTED',
      );
    }
    await db.enrollment.update({
      where: { id: fields.enrollmentId },
      data: syntheticEnrollmentValidity(),
    });
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          { ...fields, schoolPeriod: '2025' },
          staffCookie,
        )
      ).status,
      422,
    );
    const response = await post(
      '/api/secretaria/declaracao',
      fields,
      staffCookie,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const pdf = new Uint8Array(await response.arrayBuffer());
    const doc = await PDFDocument.load(pdf);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(Math.round(doc.getPage(0).getWidth()), 595);
    assert.equal(Math.round(doc.getPage(0).getHeight()), 842);
    const prepared = await db.declarationRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    assert.equal(prepared.status, 'IN_PREPARATION');
    assert.ok(prepared.generatedAt && prepared.preparedById);
    assert.equal(prepared.readyAt, null);
    const artifacts = await mkdtemp(join(tmpdir(), 'ete-declarations-test-'));
    await writeFile(join(artifacts, 'declaracao.pdf'), pdf, { flag: 'wx' });
    const batchClass = `Turma fictícia ${suffix}`;
    await db.enrollment.update({
      where: { id: student.enrollments[0].id },
      data: { className: batchClass },
    });
    const second = await db.student.create({
      data: {
        fullName: 'Estudante fictícia Marina',
        birthDate: new Date('2008-05-25T00:00:00Z'),
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            ...syntheticEnrollmentValidity(),
            className: batchClass,
            grade: 2,
            courseLabel: 'DS',
          },
        },
      },
      include: { enrollments: true },
    });
    created.push(second.id);
    const filtered = await post(
      '/api/secretaria/alunos',
      { className: batchClass, allClass: true },
      staffCookie,
    );
    const filteredRows = await filtered.json();
    assert.equal(filtered.status, 200);
    assert.equal(filteredRows.total, 2);
    assert.equal(filteredRows.students.length, 2);
    assert.ok(filteredRows.classes.includes(batchClass));
    assert.equal(
      (await post('/api/secretaria/alunos', { allClass: true }, staffCookie))
        .status,
      400,
    );
    const secondCookie = await cookie(second.id, 'student');
    const secondRequest = await post(
      '/api/declaracao/solicitacoes',
      {
        enrollmentId: second.enrollments[0].id,
        birthplace: { state: 'PE', municipalityId: '2611606' },
      },
      secondCookie,
    );
    assert.equal(secondRequest.status, 201);
    const secondRequestId = (await secondRequest.json()).request.id;
    const batchFields = {
      ...fields,
      studentId: second.id,
      enrollmentId: second.enrollments[0].id,
      frequencyPercent: '85',
    };
    const bulkBody = { items: [fields, batchFields] };
    assert.equal(
      (await post('/api/secretaria/declaracoes', bulkBody)).status,
      401,
    );
    assert.equal(
      (await post('/api/secretaria/declaracoes', bulkBody, studentCookie))
        .status,
      403,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracoes',
          bulkBody,
          staffCookie,
          'https://example.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (await post('/api/secretaria/declaracoes', { items: [] }, staffCookie))
        .status,
      400,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracoes',
          { items: Array(101).fill(fields) },
          staffCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracoes',
          { items: [fields, fields] },
          staffCookie,
        )
      ).status,
      422,
    );
    const invalidBatch = await post(
      '/api/secretaria/declaracoes',
      { items: [fields, { ...batchFields, frequencyPercent: '101' }] },
      staffCookie,
    );
    assert.equal(invalidBatch.status, 422);
    assert.equal((await invalidBatch.json()).itemIndex, 1);
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracoes',
          {
            items: [
              fields,
              { ...batchFields, enrollmentId: student.enrollments[0].id },
            ],
          },
          staffCookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: secondRequestId },
        })
      ).status,
      'REQUESTED',
    );
    // A entrada passa na validação dos campos; o conteúdo escolar excede o A4.
    // A falha ocorre no gerador, antes de registrar qualquer preparação.
    const requestsBeforeOverflow = await db.declarationRequest.findMany({
      where: { id: { in: [requestId, secondRequestId] } },
      orderBy: { id: 'asc' },
    });
    await db.student.update({
      where: { id: second.id },
      data: { fullName: 'Nome fictício '.repeat(500) },
    });
    try {
      const overflow = await post(
        '/api/secretaria/declaracoes',
        bulkBody,
        staffCookie,
      );
      assert.equal(overflow.status, 422);
      assert.match(overflow.headers.get('cache-control')!, /no-store/);
      assert.equal((await overflow.json()).itemIndex, 1);
      assert.deepEqual(
        await db.declarationRequest.findMany({
          where: { id: { in: [requestId, secondRequestId] } },
          orderBy: { id: 'asc' },
        }),
        requestsBeforeOverflow,
      );
    } finally {
      await db.student.update({
        where: { id: second.id },
        data: { fullName: second.fullName },
      });
    }
    const bulk = await post(
      '/api/secretaria/declaracoes',
      bulkBody,
      staffCookie,
    );
    assert.equal(bulk.status, 200);
    assert.match(bulk.headers.get('cache-control')!, /no-store/);
    const bulkPdf = new Uint8Array(await bulk.arrayBuffer());
    const bulkDoc = await PDFDocument.load(bulkPdf);
    assert.equal(bulkDoc.getPageCount(), 2);
    for (const page of bulkDoc.getPages()) {
      assert.equal(Math.round(page.getWidth()), 595);
      assert.equal(Math.round(page.getHeight()), 842);
    }
    await writeFile(join(artifacts, 'lote.pdf'), bulkPdf, { flag: 'wx' });
    console.log('PDFs sintéticos para conferência:', artifacts);
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: secondRequestId },
        })
      ).status,
      'IN_PREPARATION',
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: requestId },
          staffCookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', confirmed: true },
          staffCookie,
        )
      ).status,
      404,
    );
    const ready = await post(
      '/api/secretaria/solicitacoes',
      { id: requestId, confirmed: true },
      staffCookie,
    );
    assert.equal(ready.status, 200);
    const readyRow = (await ready.json()).request;
    assert.equal(readyRow.status, 'READY_FOR_PICKUP');
    assert.ok(readyRow.readyAt);
    assert.equal(
      (
        await post(
          '/api/secretaria/solicitacoes',
          { id: requestId, confirmed: true },
          staffCookie,
        )
      ).status,
      200,
    );
    const readyDb = await db.declarationRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    assert.equal(readyDb.readyAt?.toISOString(), readyRow.readyAt);
    assert.ok(readyDb.readyById);
    const refreshed = await fetch(`${base}/api/declaracao/solicitacoes`, {
      headers: { Cookie: studentCookie },
    });
    assert.equal(
      (await refreshed.json()).requests[0].status,
      'READY_FOR_PICKUP',
    );
    const otherStudent = await fetch(`${base}/api/declaracao/solicitacoes`, {
      headers: { Cookie: secondCookie },
    });
    assert.equal((await otherStudent.json()).requests[0].id, secondRequestId);
    assert.equal(
      (
        await fetch(`${base}/api/declaracao/pdf?studentId=${staff.id}`, {
          headers: { Cookie: studentCookie },
        })
      ).status,
      404,
    );
    const declarationPage = await fetch(`${base}/declaracao`, {
      headers: { Cookie: studentCookie },
    });
    const declarationHtml = await declarationPage.text();
    assert.match(declarationHtml, /Você já pode buscar/);
    assert.doesNotMatch(declarationHtml, /Baixar minuta/);
    const studentHome = await fetch(base, {
      headers: { Cookie: studentCookie },
    });
    const homeHtml = await studentHome.text();
    assert.doesNotMatch(homeHtml, /Abrir perfil|profile\/photo|Alterar foto/);
    // Gerar novamente não reabre um atendimento já liberado nem muda sua data.
    assert.equal(
      (await post('/api/secretaria/declaracao', fields, staffCookie)).status,
      200,
    );
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: requestId },
        })
      ).status,
      'READY_FOR_PICKUP',
    );
    const newRequest = await post(
      '/api/declaracao/solicitacoes',
      { enrollmentId: student.enrollments[0].id },
      studentCookie,
    );
    assert.equal(newRequest.status, 201);
    assert.notEqual((await newRequest.json()).request.id, requestId);
    const pages = await fetch(`${base}/secretaria/declaracoes`, {
      headers: { Cookie: studentCookie },
    });
    assert.equal(
      pages.status,
      404,
      'Aluno não acessa o painel administrativo e não recebe a tela antiga.',
    );
    console.log(
      'OK: solicitações persistidas e concorrentes, isolamento de alunos, preparação sem liberar retirada, confirmação e auditoria da retirada, autorização/origem, fotos e PDF do aluno removidos, frequência e lote A4.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
