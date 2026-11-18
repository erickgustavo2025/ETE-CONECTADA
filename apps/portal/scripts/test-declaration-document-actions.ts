import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import {
  changeDeclarationDocument,
  readDocumentAction,
} from '../src/lib/declaration-document-actions';
import { RequestError } from '../src/lib/declaration-requests';

async function main() {
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const post = (body: unknown, cookie: string, origin = base) =>
    fetch(base + '/api/secretaria/documentos/alteracoes', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  async function session(studentId: string, role: 'secretary' | 'student') {
    const a = await db.account.create({
      data: {
        studentId,
        email: randomUUID() + '@example.invalid',
        status: 'active',
        role,
        passwordHash: 'hash-ficticio',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        accountId: a.id,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: a.id, cookie: 'ete_portal_session=' + token };
  }
  try {
    for (const name of [
      'Secretaria fictícia',
      'Estudante fictício',
      'Outro estudante fictício',
    ]) {
      const s = await db.student.create({
        data: { fullName: name, birthDate: new Date('2008-01-01T00:00:00Z') },
      });
      ids.push(s.id);
    }
    const actor = await session(ids[0], 'secretary');
    const student = await session(ids[1], 'student');
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
    const eOther = await db.enrollment.create({
      data: {
        studentId: ids[2],
        mode: 'INTEGRADO',
        className: '1B DS',
        grade: 1,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const request = await db.declarationRequest.create({
      data: { studentId: ids[1], enrollmentId: e.id },
    });
    const makeDoc = (enrollment = e, period = '2026') =>
      db.declarationDocument.create({
        data: {
          id: randomUUID(),
          publicCode: randomBytes(32).toString('base64url'),
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          createdById: actor.id,
          snapshot: {
            type: 'DECLARACAO_VINCULO',
            mode: 'INTEGRADO',
            periodLabel: period,
          },
          sourcePdfSha256: 'a'.repeat(64),
          sourcePdfPage: 1,
        },
      });
    const doc = await makeDoc();
    const cancel = {
      documentId: doc.id,
      action: 'CANCELLED',
      reason: 'Erro nos dados conferidos.',
      confirmed: true,
    };
    assert.equal((await post(cancel, '')).status, 401);
    assert.equal(
      (await post({ ...cancel, role: 'secretary' }, student.cookie)).status,
      403,
    );
    assert.equal(
      (await post(cancel, actor.cookie, 'https://example.invalid')).status,
      403,
    );
    for (const bad of [
      { ...cancel, confirmed: false },
      { ...cancel, reason: '' },
      { ...cancel, reason: 'a'.repeat(501) },
      { ...cancel, action: 'ISSUED' },
    ])
      assert.equal((await post(bad, actor.cookie)).status, 422);
    assert.equal(
      await db.declarationDocumentAction.count({
        where: { studentId: { in: ids } },
      }),
      0,
    );
    const parallel = await Promise.all([
      post({ ...cancel, createdById: student.id }, actor.cookie),
      post(cancel, actor.cookie),
    ]);
    assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 201]);
    const event = await db.declarationDocumentAction.findUniqueOrThrow({
      where: { documentId: doc.id },
    });
    assert.equal(event.createdById, actor.id);
    assert.equal(event.action, 'CANCELLED');
    assert.equal(event.reason, cancel.reason);
    assert.equal((await post(cancel, actor.cookie)).status, 200);
    assert.deepEqual(
      await db.declarationDocumentAction.findUniqueOrThrow({
        where: { documentId: doc.id },
      }),
      event,
    );
    assert.equal(
      (
        await post(
          { ...cancel, reason: 'Outro motivo de cancelamento' },
          actor.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await post({ ...cancel, documentId: randomUUID() }, actor.cookie))
        .status,
      404,
    );
    await assert.rejects(
      db.declarationDocumentAction.update({
        where: { documentId: doc.id },
        data: { reason: 'Alteração retroativa recusada' },
      }),
    );
    assert.deepEqual(
      await db.declarationRequest.findUniqueOrThrow({
        where: { id: request.id },
      }),
      request,
      'Cancelar a minuta não altera o atendimento.',
    );
    assert.deepEqual(
      await db.declarationDocument.findUniqueOrThrow({ where: { id: doc.id } }),
      doc,
    );
    const old = await makeDoc();
    const replacement = await makeDoc();
    const foreign = await makeDoc(eOther);
    const otherPeriod = await makeDoc(e, '2027');
    const replace = {
      documentId: old.id,
      action: 'SUPERSEDED',
      successorId: replacement.id,
      reason: 'Minuta corrigida após conferência.',
      confirmed: true,
    };
    assert.equal(
      (
        await post(
          { ...replace, successorId: old.id.toUpperCase() },
          actor.cookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (await post({ ...replace, successorId: foreign.id }, actor.cookie))
        .status,
      422,
    );
    assert.equal(
      (await post({ ...replace, successorId: otherPeriod.id }, actor.cookie))
        .status,
      422,
    );
    assert.equal((await post(replace, actor.cookie)).status, 201);
    assert.equal((await post(replace, actor.cookie)).status, 200);
    const recorded = await db.declarationDocumentAction.findUniqueOrThrow({
      where: { documentId: old.id },
    });
    assert.equal(recorded.successorId, replacement.id);
    assert.equal(recorded.action, 'SUPERSEDED');
    assert.equal(
      (
        await post(
          { ...replace, documentId: replacement.id, successorId: old.id },
          actor.cookie,
        )
      ).status,
      409,
      'Substituição circular deve ser recusada.',
    );
    assert.equal(
      (await post({ ...replace, documentId: otherPeriod.id }, actor.cookie))
        .status,
      422,
    );
    const another = await makeDoc();
    assert.equal(
      (await post({ ...replace, documentId: another.id }, actor.cookie)).status,
      409,
      'Uma substituta não pode ser reaproveitada como sucessora de duas minutas.',
    );
    await assert.rejects(
      db.declarationDocumentAction.create({
        data: {
          documentId: another.id,
          studentId: ids[1],
          enrollmentId: e.id,
          action: 'SUPERSEDED',
          reason: 'Referência cruzada deve falhar',
          successorId: foreign.id,
          createdById: actor.id,
        },
      }),
    );
    await db.account.update({
      where: { id: actor.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      changeDeclarationDocument(
        readDocumentAction({ ...cancel, documentId: another.id }),
        actor.id,
      ),
      (error) => error instanceof RequestError && error.status === 403,
    );
    await db.account.update({
      where: { id: actor.id },
      data: { role: 'secretary' },
    });
    const before = await db.declarationDocumentAction.count({
      where: { studentId: { in: ids } },
    });
    process.env.DECLARATION_REGISTRY_PREVIEW = 'false';
    await assert.rejects(
      changeDeclarationDocument(
        readDocumentAction({ ...cancel, documentId: another.id }),
        actor.id,
      ),
      (error) => error instanceof RequestError && error.status === 404,
    );
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    assert.equal(
      await db.declarationDocumentAction.count({
        where: { studentId: { in: ids } },
      }),
      before,
    );
    console.log(
      'OK: cancelamento/substituição auditados, papéis/origem, confirmação/motivo, repetição e concorrência idempotentes, snapshot/pedido preservados, vínculo/período/ciclo recusados e evento imutável.',
    );
  } finally {
    await environment.close();
    if (previous === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
  }
}
main().catch(reportTestFailure);
