import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { consumeAccessAttempt } from '../src/lib/access-throttle';
import { issueDeclaration } from '../src/lib/declaration-issuance';

async function main() {
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  const env = await openTestEnvironment({ http: true });
  const { db } = env;
  let studentId: string | undefined;
  try {
    const student = await db.student.create({
      data: {
        fullName: 'Pessoa fictícia emissão automática',
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
    studentId = student.id;
    const account = await db.account.create({
      data: {
        studentId,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        role: 'student',
        status: 'active',
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        studentId,
        mode: 'INTEGRADO',
        className: '2A DS fictícia',
        grade: 2,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const legacy = await db.declarationRequest.create({
      data: { studentId, enrollmentId: enrollment.id },
    });
    const key = randomUUID();
    const issued = await issueDeclaration(account.id, {
      enrollmentId: enrollment.id,
      requestKey: key,
    });
    const requests = await db.declarationRequest.findMany({
      where: { studentId },
    });
    assert.equal(
      requests.length,
      2,
      'A emissão deve registrar o pedido automaticamente e preservar o histórico anterior.',
    );
    const request = requests.find((row) => row.id !== legacy.id)!;
    assert.equal(request.status, 'AVAILABLE');
    assert.equal(request.preparedById, null, 'Não houve preparação manual.');
    assert.equal(
      request.readyById,
      null,
      'Não houve autorização manual de retirada.',
    );
    assert.ok(request.generatedAt);
    assert.equal(request.readyAt, null);
    const repeated = await issueDeclaration(account.id, {
      enrollmentId: enrollment.id,
      requestKey: key,
    });
    assert.equal(repeated.document.id, issued.document.id);
    assert.equal(
      await db.declarationRequest.count({ where: { studentId } }),
      2,
    );
    // Uma falha na última escrita não muda nem a naturalidade nem o documento anterior.
    const beforeDocuments = await db.declarationDocument.count();
    const beforeFiles = await db.declarationPdfArchive.count();
    const beforeRequests = await db.declarationRequest.count();
    await db.studentDetails.update({
      where: { studentId },
      data: { birthplaceSource: 'STUDENT_DECLARATION' },
    });
    await db.$executeRaw`CREATE FUNCTION ec073_fail_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='AVAILABLE' THEN RAISE EXCEPTION 'Falha sintética final'; END IF; RETURN NEW; END; $$`;
    await db.$executeRaw`CREATE TRIGGER ec073_failure BEFORE INSERT ON declaration_requests FOR EACH ROW EXECUTE FUNCTION ec073_fail_request()`;
    try {
      await assert.rejects(
        issueDeclaration(
          account.id,
          { enrollmentId: enrollment.id, requestKey: randomUUID() },
          { state: 'PE', municipalityId: '2611101' },
        ),
      );
      assert.equal(await db.declarationDocument.count(), beforeDocuments);
      assert.equal(await db.declarationPdfArchive.count(), beforeFiles);
      assert.equal(await db.declarationRequest.count(), beforeRequests);
      assert.equal(
        (await db.studentDetails.findUniqueOrThrow({ where: { studentId } }))
          .birthCity,
        'Recife',
      );
      assert.equal(
        await db.declarationDocumentAction.count({
          where: { documentId: issued.document.id },
        }),
        0,
      );
      assert.equal(
        (
          await db.declarationCurrentIssue.findUniqueOrThrow({
            where: {
              enrollmentId_documentType: {
                enrollmentId: enrollment.id,
                documentType: 'DECLARACAO_VINCULO',
              },
            },
          })
        ).documentId,
        issued.document.id,
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER ec073_failure ON declaration_requests`;
      await db.$executeRaw`DROP FUNCTION ec073_fail_request()`;
    }
    await db.studentDetails.update({
      where: { studentId },
      data: { birthplaceSource: 'SCHOOL_RECORD' },
    });
    await assert.rejects(
      issueDeclaration(
        account.id,
        { enrollmentId: enrollment.id, requestKey: randomUUID() },
        { state: 'PE', municipalityId: '2611101' },
      ),
      /conferido pela escola/,
    );
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: account.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const { base } = env;
    const post = (path: string, body: unknown, cookie = token, origin = base) =>
      fetch(base + path, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: 'ete_portal_session=' + cookie,
        },
        body: JSON.stringify(body),
      });
    const nextKey = randomUUID();
    const response = await post('/api/declaracao/solicitacoes', {
      enrollmentId: enrollment.id,
      requestKey: nextKey,
    });
    assert.equal(response.status, 201);
    const delivered = await response.json();
    assert.equal(delivered.request.status, 'AVAILABLE');
    assert.ok(delivered.request.document.id);
    const payload = { documentId: delivered.request.document.id };
    const file = await post('/api/declaracao/arquivo', payload);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.match(file.headers.get('content-disposition')!, /^inline/);
    assert.match(file.headers.get('cache-control')!, /no-store/);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const download = await post('/api/declaracao/arquivo', {
      ...payload,
      download: true,
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition')!, /^attachment/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.equal(
      await db.declarationRequest.count({ where: { studentId } }),
      3,
      'Abrir/Baixar não emitem.',
    );
    const replayResponse = await post('/api/declaracao/solicitacoes', {
      enrollmentId: enrollment.id,
      requestKey: nextKey,
    });
    assert.equal(replayResponse.status, 200);
    assert.equal(
      (await replayResponse.json()).request.id,
      delivered.request.id,
    );
    assert.equal(
      (await post('/api/declaracao/arquivo', payload, '')).status,
      401,
    );
    assert.equal(
      (
        await post(
          '/api/declaracao/arquivo',
          payload,
          token,
          'https://other.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post('/api/declaracao/solicitacoes', {
          enrollmentId: enrollment.id,
          requestKey: randomUUID(),
          role: 'secretary',
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await post('/api/declaracao/solicitacoes', {
          enrollmentId: randomUUID(),
          requestKey: randomUUID(),
        })
      ).status,
      422,
    );
    const other = await db.student.create({
      data: {
        fullName: 'Outro aluno fictício',
        birthDate: new Date('2000-01-01'),
      },
    });
    const otherAccount = await db.account.create({
      data: {
        studentId: other.id,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        status: 'active',
        role: 'student',
      },
    });
    const otherToken = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: otherAccount.id,
        tokenHash: createHash('sha256').update(otherToken).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    try {
      assert.equal(
        (await post('/api/declaracao/arquivo', payload, otherToken)).status,
        404,
      );
      await db.account.update({
        where: { id: otherAccount.id },
        data: { role: 'secretary' },
      });
      assert.equal(
        (await post('/api/declaracao/arquivo', payload, otherToken)).status,
        403,
      );
      assert.equal(
        (
          await post(
            '/api/declaracao/solicitacoes',
            { enrollmentId: enrollment.id, requestKey: randomUUID() },
            otherToken,
          )
        ).status,
        403,
      );
    } finally {
      await db.student.delete({ where: { id: other.id } });
    }
    for (let i = 0; i < 10; i++)
      await consumeAccessAttempt(db, 'issuance', account.id);
    const limited = await post('/api/declaracao/solicitacoes', {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    assert.equal(limited.status, 429);
    assert.match(
      limited.headers.get('content-security-policy')!,
      /default-src 'none'/,
    );
    assert.equal(limited.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(limited.headers.get('retry-after'));
    assert.equal(
      (await consumeAccessAttempt(db, 'login', 'ficticio-' + randomUUID()))
        .allowed,
      true,
      'Emissão não bloqueia autenticação.',
    );
    await db.account.update({
      where: { id: account.id },
      data: { status: 'pending' },
    });
    assert.equal((await post('/api/declaracao/arquivo', payload)).status, 401);
    console.log(
      'OK: emissão/pedido atômicos, histórico, repetição, Abrir/Baixar e isolamento HTTP.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
