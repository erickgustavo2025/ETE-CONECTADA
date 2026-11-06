import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
async function main() {
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  const ids: string[] = [];
  async function account(studentId: string, role: string) {
    const account = await db.account.create({
      data: {
        studentId,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        role,
        status: 'active',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: account.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: account.id, cookie: 'ete_portal_session=' + token };
  }
  try {
    const tag = randomUUID();
    for (const name of ['Secretaria ' + tag, 'Aluno ' + tag, 'Outro ' + tag]) {
      const s = await db.student.create({
        data: { fullName: name, birthDate: new Date('2008-01-01') },
      });
      ids.push(s.id);
    }
    const staff = await account(ids[0], 'secretary'),
      student = await account(ids[1], 'student');
    const e = await db.enrollment.create({
      data: {
        studentId: ids[1],
        mode: 'INTEGRADO',
        className: '1A DS',
        grade: 1,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const documents = [];
    for (let i = 0; i < 23; i++)
      documents.push(
        await db.declarationDocument.create({
          data: {
            id: randomUUID(),
            publicCode: randomBytes(32).toString('base64url'),
            studentId: ids[1],
            enrollmentId: e.id,
            createdById: staff.id,
            snapshot: {
              type: 'DECLARACAO_VINCULO',
              mode: 'INTEGRADO',
              className: '1A DS',
              periodLabel: '2026',
              body: 'Texto privado fictício',
            },
            sourcePdfSha256: 'a'.repeat(64),
            sourcePdfPage: 1,
          },
        }),
      );
    await db.declarationDocumentAction.create({
      data: {
        documentId: documents[0].id,
        studentId: ids[1],
        enrollmentId: e.id,
        createdById: staff.id,
        action: 'CANCELLED',
        reason: 'Conferência fictícia',
      },
    });
    const post = (body: unknown, cookie = staff.cookie, origin = base) =>
      fetch(base + '/api/secretaria/documentos/busca', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    assert.equal((await post({}, '')).status, 401);
    assert.equal((await post({ query: tag }, student.cookie)).status, 403);
    assert.equal(
      (await post({}, staff.cookie, 'https://example.invalid')).status,
      403,
    );
    for (const body of [
      { page: -1 },
      { page: 1.5 },
      { query: 'a' },
      { from: '2026-02-30' },
      { from: '2026-10-20', to: '2026-10-19' },
      { studentId: 'invalid' },
      { status: 'UNKNOWN' },
      { mode: 'ADMIN' },
    ])
      assert.equal((await post(body)).status, 422, JSON.stringify(body));
    const html = await (
      await fetch(base + '/secretaria/declaracoes', {
        headers: { Cookie: staff.cookie },
      })
    ).text();
    for (const name of [
      'records',
      'query',
      'mode',
      'status',
      'className',
      'from',
      'to',
    ]) {
      const control = html.match(
        new RegExp('<(?:select|input)[^>]*name="' + name + '"[^>]*>'),
      )?.[0];
      assert.ok(
        control?.includes('disabled=""'),
        'Filtro aguarda hidratação antes de aceitar edição: ' + name,
      );
    }
    const empty = await post({});
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).students.length, 1);
    const request = await db.declarationRequest.create({
      data: { studentId: ids[1], enrollmentId: e.id },
    });
    const requests = await (await post({ records: 'requests' })).json();
    assert.equal(requests.total, 1);
    assert.equal(requests.requests[0].id, request.id);
    assert.equal(requests.requests[0].name, 'Aluno ' + tag);
    assert.equal(requests.requests[0].status, 'REQUESTED');
    assert.equal(requests.requests[0].document, null);
    assert(!JSON.stringify(requests).includes('Texto privado'));
    assert(!JSON.stringify(requests).includes('parentOne'));
    assert.equal(
      (await (await post({ records: 'requests', mode: 'SUBSEQUENTE' })).json())
        .total,
      0,
    );
    for (const body of [
      { records: 'OTHER' },
      { records: 'requests', status: 'ISSUED' },
      { query: tag, role: 'secretary' },
    ])
      assert.equal((await post(body)).status, 422);
    const response = await post({ query: tag, mode: 'INTEGRADO' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const found = await response.json();
    assert.equal(found.total, 1);
    assert.equal(found.students[0].id, ids[1]);
    assert.equal(found.students[0].count, 23);
    assert(!JSON.stringify(found).includes('Texto privado'));
    assert(!JSON.stringify(found).includes('publicCode'));
    const list = await (await post({ studentId: ids[1] })).json();
    assert.equal(list.documents.length, 20);
    assert.equal(list.total, 23);
    const next = await (await post({ studentId: ids[1], page: 999 })).json();
    assert.equal(next.page, 2);
    assert.equal(next.documents.length, 3);
    assert(
      !list.documents.some((a: { id: string }) =>
        next.documents.some((b: { id: string }) => a.id === b.id),
      ),
    );
    const cancelled = await (
      await post({ studentId: ids[1], status: 'CANCELLED' })
    ).json();
    assert.equal(cancelled.total, 1);
    assert.equal(cancelled.documents[0].state, 'CANCELLED');
    const drafts = await (
      await post({ studentId: ids[1], status: 'DRAFT' })
    ).json();
    assert.equal(drafts.total, 22);
    assert.equal(
      (await (await post({ query: tag, mode: 'SUBSEQUENTE' })).json()).total,
      0,
    );
    assert.equal(
      (await (await post({ query: tag, className: 'Outra turma' })).json())
        .total,
      0,
    );
    const detail = await (await post({ documentId: documents[0].id })).json();
    assert.equal(detail.document.body, 'Texto privado fictício');
    assert.equal(detail.document.history.length, 2);
    assert.equal(detail.document.history[1].reason, 'Conferência fictícia');
    assert.equal(detail.successors.length, 22);
    assert.equal((await post({ documentId: randomUUID() })).status, 404);
    const registration = '9000' + String(Date.now());
    await db.student.update({
      where: { id: ids[1] },
      data: { fullName: null, schoolRegistration: registration },
    });
    await db.student.update({
      where: { id: ids[0] },
      data: { fullName: null },
    });
    const unnamed = await (await post({ query: registration })).json();
    assert.equal(unnamed.students[0].name, 'Aluno sem nome informado');
    const unnamedActor = await (
      await post({ documentId: documents[0].id })
    ).json();
    assert.equal(
      unnamedActor.document.history[0].actor,
      'Nome do responsável não informado',
    );
    assert.equal(
      unnamedActor.document.history[1].actor,
      'Nome do responsável não informado',
    );
    console.log(
      'OK: busca privada por aluno, estados/modalidade/turma/datas, paginação estável, detalhe auditado e recusas de acesso.',
    );
  } finally {
    try {
      await db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await env.close();
      delete process.env.DECLARATION_REGISTRY_PREVIEW;
    }
  }
}
main().catch(reportTestFailure);
