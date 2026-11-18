import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { issueDeclaration } from '../src/lib/declaration-issuance';
import { changeDeclarationDocument } from '../src/lib/declaration-document-actions';
import { consumeAccessAttempt } from '../src/lib/access-throttle';
import { isPublicVerification } from '../src/lib/public-verification-types';
async function main() {
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW,
    previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  process.env.PORTAL_PUBLIC_URL = base;
  const ids: string[] = [];
  try {
    async function person(role: 'student' | 'secretary') {
      const s = await db.student.create({
        data: {
          fullName: 'Pessoa Fictícia Verificação ' + randomUUID(),
          birthDate: new Date('2000-01-01'),
          details: {
            create: {
              parentOne: 'Filiação fictícia privada',
              parentageSource: 'SCHOOL_RECORD',
              birthCity: 'Recife',
              birthState: 'PE',
              birthCountry: 'BR',
              birthplaceSource: 'SCHOOL_RECORD',
            },
          },
        },
      });
      ids.push(s.id);
      const a = await db.account.create({
        data: {
          studentId: s.id,
          email: randomUUID() + '@example.invalid',
          passwordHash: 'ficticio',
          role,
          status: 'active',
        },
      });
      return { s, a };
    }
    const student = await person('student'),
      staff = await person('secretary');
    const enrollment = await db.enrollment.create({
      data: {
        studentId: student.s.id,
        mode: 'INTEGRADO',
        className: '2A DS fictícia',
        grade: 2,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    await db.studentDetails.update({
      where: { studentId: student.s.id },
      data: {
        socialName: 'Nome Social Fictício',
        socialNameSource: 'SCHOOL_RECORD',
      },
    });
    const first = await issueDeclaration(student.a.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    async function post(body: unknown, origin = base) {
      return fetch(base + '/api/documentos/verificacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(body),
      });
    }
    const publicCode = first.document.publicCode;
    const response = await post({ code: publicCode });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const view: unknown = await response.json();
    assert.ok(isPublicVerification(view));
    assert.equal(view.state, 'VALID');
    assert.equal(view.testOnly, true);
    assert.equal(view.nameMatches, null);
    assert.equal(view.document.mode, 'Integrado');
    assert.equal(view.document.nameMasked, 'Nom*** Fic***');
    assert.equal(
      (
        await (
          await post({ code: publicCode, fullName: 'Nome Social Fictício' })
        ).json()
      ).nameMatches,
      true,
    );
    assert.equal(view.document.level, '2º ano');
    assert.deepEqual(
      Object.keys(view.document).sort(),
      [
        'nameMasked',
        'issuer',
        'type',
        'issuedAt',
        'course',
        'mode',
        'level',
        'period',
      ].sort(),
    );
    const publicText = JSON.stringify(view.document);
    for (const privateValue of [
      student.s.fullName,
      student.s.id,
      enrollment.id,
      'Filiação fictícia privada',
      '2000-01-01',
    ])
      assert.ok(!publicText.includes(privateValue!));
    assert.equal(
      (await post({ code: publicCode, fullName: student.s.fullName })).status,
      200,
    );
    assert.equal(
      (
        await (
          await post({ code: publicCode, fullName: student.s.fullName })
        ).json()
      ).nameMatches,
      true,
    );
    assert.equal(
      (
        await (
          await post({ code: publicCode, fullName: 'Outro nome fictício' })
        ).json()
      ).nameMatches,
      false,
    );
    for (const body of [
      { code: publicCode, role: 'secretary' },
      { code: publicCode, studentId: staff.s.id },
      { code: publicCode, download: true },
      { code: publicCode, fullName: [] },
      { code: 'x' },
    ])
      assert.equal((await post(body)).status, 422);
    assert.equal(
      (await post({ code: publicCode }, 'https://evil.invalid')).status,
      403,
    );
    const noOrigin = await fetch(base + '/api/documentos/verificacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: publicCode }),
    });
    assert.equal(noOrigin.status, 403);
    assert.equal(
      (await post({ code: publicCode, fullName: 'X'.repeat(5000) })).status,
      413,
    );
    assert.equal(
      (await post({ code: randomBytes(32).toString('base64url') })).status,
      404,
    );
    const raw = await db.declarationDocument.findUniqueOrThrow({
      where: { id: first.document.id },
      include: { archive: true },
    });
    assert.equal(raw.archive?.templateVersion, 'minuta-a4-qr-v1');
    assert.equal(
      (raw.snapshot as { verificationVersion: number }).verificationVersion,
      1,
    );
    assert.equal(view.pdfSha256, raw.sourcePdfSha256);
    const legacy = await db.declarationDocument.create({
      data: {
        id: randomUUID(),
        publicCode: randomBytes(32).toString('base64url'),
        studentId: student.s.id,
        enrollmentId: enrollment.id,
        createdById: staff.a.id,
        snapshot: {
          type: 'DECLARACAO_VINCULO',
          body: 'Minuta histórica fictícia',
        },
        sourcePdfSha256: 'a'.repeat(64),
        sourcePdfPage: 1,
      },
    });
    assert.equal(
      (await post({ code: legacy.publicCode })).status,
      404,
      'Minutas antigas nunca são promovidas para a consulta pública.',
    );
    const legacyIssue = await db.declarationDocument.create({
      data: {
        id: randomUUID(),
        publicCode: randomBytes(32).toString('base64url'),
        studentId: student.s.id,
        enrollmentId: enrollment.id,
        createdById: student.a.id,
        status: 'ISSUED',
        origin: 'STUDENT_REQUEST',
        requestKey: randomUUID(),
        snapshotVersion: 2,
        snapshot: {
          type: 'DECLARACAO_VINCULO',
          testOnly: true,
          subjectName: student.s.fullName,
        },
        sourcePdfSha256: raw.sourcePdfSha256,
        archiveSha256: raw.archiveSha256,
        sourcePdfPage: 1,
      },
    });
    assert.equal(
      (await post({ code: legacyIssue.publicCode })).status,
      404,
      'Emissão de teste anterior à publicação do QR também permanece privada.',
    );
    await assert.rejects(
      () =>
        changeDeclarationDocument(
          {
            documentId: first.document.id,
            action: 'SUPERSEDED',
            reason: 'Tentativa de promoção manual de registro antigo',
            successorId: legacyIssue.id,
          },
          staff.a.id,
        ),
      (error: unknown) =>
        error instanceof Error && /nova emissão/.test(error.message),
    );
    assert.equal(
      (await (await post({ code: publicCode })).json()).state,
      'VALID',
    );
    const pdfAnonymous = await fetch(
      base + '/api/secretaria/documentos/arquivo',
      {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: first.document.id }),
      },
    );
    assert.ok([401, 403].includes(pdfAnonymous.status));
    assert.notEqual(
      pdfAnonymous.headers.get('content-type'),
      'application/pdf',
    );
    const changedName = 'Nome corrigido fictício ' + randomUUID();
    await db.student.update({
      where: { id: student.s.id },
      data: { fullName: changedName },
    });
    assert.equal(
      (
        await (
          await post({ code: publicCode, fullName: student.s.fullName })
        ).json()
      ).nameMatches,
      true,
      'A consulta confere o snapshot, sem reescrever documento após mudar o cadastro.',
    );
    const second = await issueDeclaration(student.a.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    assert.equal(
      (await (await post({ code: publicCode })).json()).state,
      'SUPERSEDED',
    );
    assert.equal(
      (await (await post({ code: second.document.publicCode })).json()).state,
      'VALID',
    );
    await changeDeclarationDocument(
      {
        documentId: second.document.id,
        action: 'CANCELLED',
        reason: 'Cancelamento fictício para verificação',
        successorId: null,
      },
      staff.a.id,
    );
    assert.equal(
      (await (await post({ code: second.document.publicCode })).json()).state,
      'CANCELLED',
    );
    await db.$executeRaw`ALTER TABLE declaration_current_issues RENAME TO ec096_current_unavailable`;
    try {
      assert.equal(
        (await post({ code: publicCode })).status,
        503,
        'Falha de armazenamento não pode significar documento inválido.',
      );
    } finally {
      await db.$executeRaw`ALTER TABLE ec096_current_unavailable RENAME TO declaration_current_issues`;
    }
    assert.equal(
      (await (await post({ code: second.document.publicCode })).json()).state,
      'CANCELLED',
    );
    let limited = false;
    for (let i = 0; i < 12; i++)
      if (
        (await post({ code: publicCode, fullName: 'Nome tentado fictício' }))
          .status === 429
      ) {
        limited = true;
        break;
      }
    assert.ok(limited);
    assert.equal(
      (await post({ code: publicCode })).status,
      200,
      'Conferência de nomes não esgota a consulta simples.',
    );
    await db.accessAttemptBucket.deleteMany();
    for (let i = 0; i < 300; i++)
      assert.equal(
        (await consumeAccessAttempt(db, 'document-lookup', 'code-fixture-' + i))
          .allowed,
        true,
      );
    assert.equal(
      (await consumeAccessAttempt(db, 'document-lookup', 'mais-um')).allowed,
      false,
    );
    assert.equal(
      (await consumeAccessAttempt(db, 'login', 'login-separado')).allowed,
      true,
      'Consultas públicas não esgotam o orçamento global de login.',
    );
    await db.accessAttemptBucket.deleteMany();
    console.log(
      'OK: consulta anônima mínima, nome mascarado/conferência, sem PDF/PII/listagem, legado privado, estado atual/cadastro alterado/rollback, falha503, origem/limites e orçamento separado de login.',
    );
  } finally {
    await env.close();
    if (previous === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previousOrigin;
  }
}
main().catch(reportTestFailure);
