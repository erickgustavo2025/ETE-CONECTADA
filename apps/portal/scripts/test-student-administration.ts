import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { administerStudents } from '../src/lib/student-administration';
import { issueDeclaration } from '../src/lib/declaration-issuance';
import { readStudentDeclarationPdf } from '../src/lib/declaration-pdf-archive';
import {
  createVerifiedSession,
  findSessionRecord,
} from '../src/lib/session-record';
import { hashPassword } from '../src/lib/password';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  const env = await openTestEnvironment({ http: true });
  const ids: string[] = [];
  try {
    async function person(role: 'student' | 'secretary') {
      const student = await env.db.student.create({
        data: {
          fullName: 'Pessoa fictícia administração ' + role,
          birthDate: new Date('2000-01-01'),
        },
      });
      ids.push(student.id);
      const account = await env.db.account.create({
        data: {
          studentId: student.id,
          status: 'active',
          role,
          email: randomUUID() + '@example.invalid',
          passwordHash: await hashPassword('Senha-ficticia-de-teste-123!'),
        },
      });
      const token = randomBytes(32).toString('base64url');
      await env.db.session.create({
        data: {
          accountId: account.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      return { student, account, token };
    }
    const staff = await person('secretary');
    const student = await person('student');
    const post = (body: unknown, token = staff.token) =>
      fetch(env.base + '/api/secretaria/alunos/administracao', {
        method: 'POST',
        headers: {
          Origin: env.base,
          'Content-Type': 'application/json',
          Cookie: 'ete_portal_session=' + token,
        },
        body: JSON.stringify(body),
      });
    const found = await post({
      operation: 'search',
      query: 'Pessoa fictícia administração student',
    });
    assert.equal(
      found.status,
      200,
      'A secretaria deve poder encontrar o aluno no painel privado.',
    );
    const result = await found.json();
    assert.equal(result.students[0].id, student.student.id);
    assert.equal(
      (await post({ operation: 'search', query: 'Pessoa' }, student.token))
        .status,
      403,
    );
    assert.ok(!JSON.stringify(result).includes('birthDate'));
    assert.ok(!JSON.stringify(result).includes('password'));
    assert.ok(!JSON.stringify(result).includes('@example.invalid'));
    assert.equal(result.students.length, 1);
    const enrollment = await env.db.enrollment.create({
      data: {
        studentId: student.student.id,
        mode: 'INTEGRADO',
        className: '2A DS fictícia',
        grade: 2,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    await env.db.studentDetails.create({
      data: {
        studentId: student.student.id,
        parentOne: 'Filiação fictícia',
        parentageSource: 'SCHOOL_RECORD',
        birthCity: 'Recife',
        birthState: 'PE',
        birthCountry: 'BR',
        birthplaceSource: 'SCHOOL_RECORD',
      },
    });
    const key = randomUUID();
    const issued = await issueDeclaration(student.account.id, {
      enrollmentId: enrollment.id,
      requestKey: key,
    });
    const original = await readStudentDeclarationPdf(
      env.db,
      student.account.id,
      issued.document.id,
    );
    const beforeCount = await env.db.declarationDocument.count();
    const change = (
      kind: 'LOGIN' | 'ISSUANCE',
      blocked: boolean,
      revision: number,
      requestKey = randomUUID(),
    ) => ({
      operation: 'change',
      studentId: student.student.id,
      kind,
      blocked,
      revision,
      requestKey,
      confirmed: true,
      reason: 'Conferência fictícia\npela secretaria',
    });
    const blockIssue = change('ISSUANCE', true, 0);
    const blocked = await post(blockIssue);
    assert.equal(blocked.status, 200);
    assert.equal((await blocked.json()).student.issuanceBlocked, true);
    assert.equal((await post(blockIssue)).status, 200);
    assert.equal(
      await env.db.studentAccessChange.count(),
      1,
      'Repetição não duplica auditoria.',
    );
    await assert.rejects(
      issueDeclaration(student.account.id, {
        enrollmentId: enrollment.id,
        requestKey: randomUUID(),
      }),
      /bloqueada/,
    );
    const replay = await issueDeclaration(student.account.id, {
      enrollmentId: enrollment.id,
      requestKey: key,
    });
    assert.equal(
      replay.created,
      false,
      'Repetir emissão existente não cria nova.',
    );
    assert.equal(replay.document.id, issued.document.id);
    assert.deepEqual(
      (
        await readStudentDeclarationPdf(
          env.db,
          student.account.id,
          issued.document.id,
        )
      ).bytes,
      original.bytes,
    );
    assert.equal(
      await env.db.declarationDocumentAction.count({
        where: { studentId: student.student.id },
      }),
      0,
      'Bloqueio não cancela documento.',
    );
    assert.equal(await env.db.declarationDocument.count(), beforeCount);
    assert.ok(
      await findSessionRecord(
        env.db,
        createHash('sha256').update(student.token).digest('hex'),
      ),
    );
    assert.equal(
      (await post({ ...change('LOGIN', true, 0) })).status,
      409,
      'Tela antiga deve ser recusada.',
    );
    assert.equal(
      (await post({ ...blockIssue, blocked: false })).status,
      409,
      'Mesma chave não muda de intenção.',
    );
    const statuses = await Promise.all([
      post(change('ISSUANCE', false, 1)),
      post(change('LOGIN', true, 1)),
    ]);
    assert.deepEqual(statuses.map((r) => r.status).sort(), [200, 409]);
    let current = await env.db.student.findUniqueOrThrow({
      where: { id: student.student.id },
    });
    if (!current.loginBlocked)
      assert.equal(
        (await post(change('LOGIN', true, current.accessRevision))).status,
        200,
      );
    current = await env.db.student.findUniqueOrThrow({
      where: { id: student.student.id },
    });
    assert.equal(
      await env.db.session.count({ where: { accountId: student.account.id } }),
      0,
    );
    assert.equal(
      await findSessionRecord(
        env.db,
        createHash('sha256').update(student.token).digest('hex'),
      ),
      null,
    );
    assert.equal(
      await createVerifiedSession(
        env.db,
        student.account.id,
        student.account.passwordHash!,
        createHash('sha256').update(randomUUID()).digest('hex'),
        new Date(Date.now() + 600000),
      ),
      false,
    );
    await assert.rejects(
      readStudentDeclarationPdf(env.db, student.account.id, issued.document.id),
      /autorizado/,
    );
    await assert.rejects(
      issueDeclaration(student.account.id, {
        enrollmentId: enrollment.id,
        requestKey: key,
      }),
      /novamente/,
    );
    const login = await fetch(env.base + '/api/login', {
      method: 'POST',
      headers: { Origin: env.base, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: student.account.email,
        password: 'Senha-ficticia-de-teste-123!',
      }),
    });
    assert.equal(login.status, 401);
    assert.equal(
      (await post(change('LOGIN', false, current.accessRevision))).status,
      200,
    );
    assert.equal(
      await findSessionRecord(
        env.db,
        createHash('sha256').update(student.token).digest('hex'),
      ),
      null,
      'Desbloquear exige novo login.',
    );
    assert.equal(
      await createVerifiedSession(
        env.db,
        student.account.id,
        student.account.passwordHash!,
        createHash('sha256').update(randomUUID()).digest('hex'),
        new Date(Date.now() + 600000),
      ),
      true,
    );
    const detail = await (
      await post({ operation: 'detail', studentId: student.student.id })
    ).json();
    assert.equal(detail.student.loginBlocked, false);
    assert.ok(
      detail.history.every(
        (h: { actor: string; reason: string }) =>
          h.actor.includes('secretary') && h.reason,
      ),
    );
    const historyBefore = await env.db.studentAccessChange.count();
    const before = await env.db.student.findUniqueOrThrow({
      where: { id: student.student.id },
    });
    await env.db
      .$executeRaw`CREATE FUNCTION ec124_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintética'; END; $$`;
    await env.db
      .$executeRaw`CREATE TRIGGER ec124_failure BEFORE INSERT ON student_access_changes FOR EACH ROW EXECUTE FUNCTION ec124_fail_audit()`;
    try {
      await assert.rejects(
        administerStudents(
          staff.account.id,
          change('LOGIN', true, before.accessRevision),
        ),
      );
    } finally {
      await env.db
        .$executeRaw`DROP TRIGGER ec124_failure ON student_access_changes`;
      await env.db.$executeRaw`DROP FUNCTION ec124_fail_audit()`;
    }
    assert.equal(
      (
        await env.db.student.findUniqueOrThrow({
          where: { id: student.student.id },
        })
      ).accessRevision,
      before.accessRevision,
    );
    assert.equal(await env.db.studentAccessChange.count(), historyBefore);
    await assert.rejects(
      env.db.studentAccessChange.updateMany({
        where: { studentId: student.student.id },
        data: { reason: 'Alteração fictícia' },
      }),
    );
    assert.equal(
      (
        await post({
          ...change('LOGIN', true, before.accessRevision),
          studentId: staff.student.id,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post({
          ...change('LOGIN', true, before.accessRevision),
          role: 'secretary',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({
          ...change('LOGIN', true, before.accessRevision),
          confirmed: false,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({
          ...change('LOGIN', true, before.accessRevision),
          reason: 'Falha\u0000controle',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({
          operation: 'search',
          query: 'Pessoa',
          mode: 'SUBSEQUENTE',
        })
      ).status,
      200,
    );
    const filtered = await (
      await post({
        operation: 'search',
        mode: 'INTEGRADO',
        className: enrollment.className,
      })
    ).json();
    assert.equal(filtered.total, 1);
    assert.equal(filtered.classes[0], enrollment.className);
    const origin = await fetch(
      env.base + '/api/secretaria/alunos/administracao',
      {
        method: 'POST',
        headers: {
          Origin: 'https://other.example.invalid',
          'Content-Type': 'application/json',
          Cookie: 'ete_portal_session=' + staff.token,
        },
        body: '{}',
      },
    );
    assert.equal(origin.status, 403);
    const oversized = await fetch(
      env.base + '/api/secretaria/alunos/administracao',
      {
        method: 'POST',
        headers: {
          Origin: env.base,
          'Content-Type': 'application/json',
          Cookie: 'ete_portal_session=' + staff.token,
        },
        body: JSON.stringify({ query: 'x'.repeat(4100) }),
      },
    );
    assert.equal(oversized.status, 413);
    const unclaimed = await env.db.student.create({
      data: {
        fullName: 'Pessoa fictícia sem conta',
        birthDate: new Date('2000-01-01'),
      },
    });
    ids.push(unclaimed.id);
    const first = {
      operation: 'change',
      studentId: unclaimed.id,
      kind: 'LOGIN',
      blocked: true,
      revision: 0,
      requestKey: randomUUID(),
      confirmed: true,
      reason: 'Conferência fictícia sem conta',
    };
    await administerStudents(staff.account.id, first);
    const laterAccount = await env.db.account.create({
      data: {
        studentId: unclaimed.id,
        status: 'active',
        role: 'student',
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
      },
    });
    assert.equal(
      await createVerifiedSession(
        env.db,
        laterAccount.id,
        'ficticio',
        createHash('sha256').update(randomUUID()).digest('hex'),
        new Date(Date.now() + 600000),
      ),
      false,
    );
    for (let i = 1; i <= 22; i++)
      await administerStudents(staff.account.id, {
        ...first,
        revision: i,
        blocked: i % 2 === 0,
        requestKey: randomUUID(),
      });
    const secondPage = await administerStudents(staff.account.id, {
      operation: 'detail',
      studentId: unclaimed.id,
      page: 2,
    });
    assert.equal(secondPage.history.length, 3);
    assert.equal(secondPage.total, 23);
    const replayOld = await administerStudents(staff.account.id, first);
    assert.equal(replayOld.created, false);
    assert.equal(
      replayOld.student?.revision,
      23,
      'Repetição antiga retorna o estado atual.',
    );
    await env.db.account.update({
      where: { id: staff.account.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      administerStudents(staff.account.id, { operation: 'search' }),
      /acesso/,
    );
    assert.equal((await post({ operation: 'search' })).status, 403);
    console.log(
      'OK: administração privada, filtros, bloqueios independentes, sessões encerradas, versões, concorrência, repetição, auditoria imutável e rollback.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
