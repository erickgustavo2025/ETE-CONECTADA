import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { sheetFixture } from './test-sheet-input';
import { reviewEnrollment } from '../src/lib/enrollment-validity';

async function main() {
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  let actorStudentId: string | undefined;
  let constraint = false;
  try {
    assert.equal(await db.student.count(), 0, 'Exige banco novo sintético.');
    const actor = await db.student.create({
      data: {
        fullName: 'Operador fictício EC057',
        birthDate: new Date('2000-01-01'),
        account: {
          create: {
            role: 'secretary',
            status: 'active',
            email: `history-${randomUUID()}@eteconectada.invalid`,
            passwordHash: 'hash-ficticio',
          },
        },
      },
      include: { account: true },
    });
    actorStudentId = actor.id;
    const actorId = actor.account!.id;
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: actorId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const post = (body: unknown) =>
      fetch(`${base}/api/secretaria/importacao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          Cookie: `ete_portal_session=${token}`,
        },
        body: JSON.stringify(body),
      });
    const fixture = sheetFixture();
    const payload = () => ({
      action: 'preview',
      mode: 'INTEGRADO',
      fileBase64: fixture.file().toString('base64'),
      contexts: [fixture.context],
    });
    const preview = async (body: Record<string, unknown> = payload()) => {
      const result = await post(body);
      assert.equal(result.status, 200);
      return { body, value: await result.json() };
    };
    const confirm = (p: Awaited<ReturnType<typeof preview>>, extra = {}) =>
      post({
        ...p.body,
        action: 'confirm',
        token: p.value.token,
        confirmed: true,
        ...extra,
      });
    const count = () => db.enrollmentImportHistory.count();
    const first = await preview();
    assert.equal(await count(), 0, 'Prévia não grava histórico.');
    assert.equal((await confirm(first)).status, 200);
    assert.equal(
      await count(),
      0,
      'Matrícula nova não possui versão anterior.',
    );
    const student = await db.student.findUniqueOrThrow({
      where: { schoolRegistration: '00001001' },
      include: { enrollments: true },
    });
    const id = student.enrollments[0].id;
    const account = await db.account.create({
      data: {
        studentId: student.id,
        email: 'history-student@eteconectada.invalid',
        passwordHash: 'hash-preservado',
        status: 'active',
        role: 'student',
      },
    });
    const unchanged = await preview();
    assert.equal((await confirm(unchanged)).status, 200);
    assert.equal(await count(), 0, 'Reimportação idêntica não gera histórico.');
    const validity = {
      status: 'ACTIVE',
      periodLabel: '2026',
      validFrom: '2000-01-01',
      validUntil: '2099-12-31',
    };
    await reviewEnrollment(db, actorId, id, validity);
    const before = await db.enrollment.findUniqueOrThrow({ where: { id } });
    const other = await db.enrollment.create({
      data: {
        studentId: student.id,
        mode: 'SUBSEQUENTE',
        className: 'Enfermagem fictícia',
        moduleNumber: 1,
        courseLabel: 'ENF',
      },
    });
    await reviewEnrollment(db, actorId, other.id, validity);
    const otherBefore = await db.enrollment.findUniqueOrThrow({
      where: { id: other.id },
    });
    const closed = await db.enrollment.create({
      data: {
        studentId: student.id,
        mode: 'INTEGRADO',
        className: 'Encerrada fictícia',
        grade: 1,
        courseLabel: 'DS',
        status: 'ENDED',
      },
    });
    fixture.context.className = 'Turma fictícia B';
    fixture.context.stage = 2;
    fixture.context.periodLabel = '2027';
    fixture.wb.Sheets['Fictícia'].A4 = { t: 's', v: '2ANO - TURMA-FICTICIA-B' };
    const moved = await preview();
    assert.equal(moved.value.counts.updatedEnrollments, 1);
    assert.equal(await count(), 0);
    assert.equal((await confirm(moved, { confirmed: false })).status, 422);
    assert.equal(await count(), 0, 'Confirmação recusada não gera histórico.');
    assert.equal((await confirm(moved)).status, 200);
    assert.equal(
      await count(),
      1,
      'Mudança de turma/período/série preserva a versão anterior.',
    );
    const history = await db.enrollmentImportHistory.findFirstOrThrow();
    for (const field of [
      'mode',
      'className',
      'grade',
      'moduleNumber',
      'courseLabel',
      'schoolYear',
      'periodLabel',
      'validFrom',
      'validUntil',
      'status',
      'reviewedAt',
    ] as const)
      assert.deepEqual(
        history[field],
        before[field],
        `Histórico preserva ${field}.`,
      );
    assert.equal(history.recordedById, actorId);
    assert.equal(history.reason, 'METADATA_CHANGE');
    const current = await db.enrollment.findUniqueOrThrow({ where: { id } });
    assert.equal(current.grade, 2);
    assert.equal(current.periodLabel, '2027');
    assert.equal(current.className, 'Turma fictícia B');
    assert.equal(current.status, 'UNCONFIRMED');
    assert.equal(current.reviewedAt, null);
    assert.deepEqual(
      await db.enrollment.findUniqueOrThrow({ where: { id: other.id } }),
      otherBefore,
      'Mudança acadêmica do integrado preserva o vínculo subsequente.',
    );
    assert.deepEqual(
      await db.account.findUniqueOrThrow({ where: { id: account.id } }),
      account,
    );
    assert.equal((await confirm(moved)).status, 200);
    const repeated = await preview();
    assert.equal((await confirm(repeated)).status, 200);
    assert.equal(
      await count(),
      1,
      'Repetição de token ou arquivo não duplica versões.',
    );
    const stale = await preview();
    await db.enrollment.update({
      where: { id },
      data: { className: 'Conferência posterior' },
    });
    assert.equal((await confirm(stale)).status, 409);
    assert.equal(await count(), 1);
    await db.enrollment.update({
      where: { id },
      data: { className: fixture.context.className },
    });
    const badScope = await preview({
      ...payload(),
      contexts: [{ ...fixture.context, scopeId: randomUUID() }],
    });
    assert.equal(badScope.value.counts.conflicts, 1);
    assert.equal((await confirm(badScope)).status, 409);
    assert.equal(
      await count(),
      1,
      'Conflito não cria versão ou duplica vínculo.',
    );
    await reviewEnrollment(db, actorId, id, {
      ...validity,
      periodLabel: '2027',
    });
    fixture.wb.Sheets['Fictícia'].B7 = {
      t: 's',
      v: 'Pessoa Fictícia Corrigida',
    };
    const identity = await preview();
    assert.equal((await confirm(identity)).status, 409);
    assert.equal(await count(), 1);
    assert.equal(
      (await confirm(identity, { acceptIdentityChanges: true })).status,
      200,
    );
    assert.equal(
      await count(),
      3,
      'Conferências ativas invalidadas preservadas em ambos os vínculos.',
    );
    assert.equal(
      await db.enrollmentImportHistory.count({
        where: { reason: 'IDENTITY_REVIEW' },
      }),
      2,
    );
    assert.equal(
      await db.enrollmentImportHistory.count({
        where: { enrollmentId: closed.id },
      }),
      0,
    );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: closed.id } }))
        .status,
      'ENDED',
    );
    const againIdentity = await preview();
    assert.equal((await confirm(againIdentity)).status, 200);
    assert.equal(await count(), 3);
    const sub = sheetFixture('SUBSEQUENTE');
    sub.context.className = other.className;
    sub.wb.Sheets['Fictícia'].B7 = { t: 's', v: 'Pessoa Fictícia Corrigida' };
    const subPayload = () => ({
      action: 'preview',
      mode: 'SUBSEQUENTE',
      fileBase64: sub.file().toString('base64'),
      contexts: [{ ...sub.context, bindings: { '00001001': other.id } }],
    });
    const link = await preview(subPayload());
    assert.equal((await confirm(link)).status, 200);
    assert.equal(
      await count(),
      3,
      'Associar fonte sem mudar dados não inventa versão.',
    );
    const integratedBeforeSubChange = await db.enrollment.findUniqueOrThrow({
      where: { id },
    });
    sub.context.stage = 2;
    sub.context.periodLabel = '2027.1';
    sub.wb.Sheets['Fictícia'].A4 = { t: 's', v: '2MODULO - TURMA-FICTICIA' };
    const advanced = await preview(subPayload());
    assert.equal((await confirm(advanced)).status, 200);
    assert.equal(await count(), 4);
    const subHistory = await db.enrollmentImportHistory.findFirstOrThrow({
      where: { enrollmentId: other.id, reason: 'METADATA_CHANGE' },
    });
    assert.equal(subHistory.moduleNumber, 1);
    assert.equal(subHistory.grade, null);
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: other.id } }))
        .moduleNumber,
      2,
    );
    assert.deepEqual(
      await db.enrollment.findUniqueOrThrow({ where: { id } }),
      integratedBeforeSubChange,
      'Mudança de módulo subsequente não altera a matrícula integrada.',
    );
    // A primeira linha altera vínculo existente; a segunda falha depois da escrita do histórico.
    fixture.context.className = 'Turma fictícia C';
    fixture.wb.Sheets['Fictícia'].B7 = {
      t: 's',
      v: 'Pessoa Fictícia Correção Dupla',
    };
    XLSX.utils.sheet_add_aoa(
      fixture.wb.Sheets['Fictícia'],
      [
        [
          '00001003',
          'Pessoa Fictícia Três',
          '01/01/2000',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
      ],
      { origin: 'A8' },
    );
    const bulk = await preview();
    await db.$executeRaw`ALTER TABLE enrollments ADD CONSTRAINT ec057_test_rollback CHECK (school_import_key NOT LIKE '%:00001003')`;
    constraint = true;
    assert.equal(
      (await confirm(bulk, { acceptIdentityChanges: true })).status,
      409,
    );
    assert.equal(
      await count(),
      4,
      'Rollback remove versões do lote que falhou.',
    );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id } })).className,
      'Turma fictícia B',
    );
    assert.equal(
      await db.student.count({ where: { schoolRegistration: '00001003' } }),
      0,
    );
    assert.equal(
      (await db.sheetImportPreview.findUniqueOrThrow({ where: { actorId } }))
        .consumedAt,
      null,
    );
    await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec057_test_rollback`;
    constraint = false;
    assert.equal(
      (await confirm(bulk, { acceptIdentityChanges: true })).status,
      200,
    );
    assert.equal(await count(), 5);
    assert.equal(
      (await confirm(bulk, { acceptIdentityChanges: true })).status,
      200,
    );
    assert.equal(await count(), 5);
    assert.deepEqual(
      await db.account.findUniqueOrThrow({ where: { id: account.id } }),
      account,
    );
    await db.student.delete({ where: { id: actor.id } });
    assert.equal(
      await count(),
      5,
      'Excluir operador preserva histórico sem a referência da conta.',
    );
    assert.equal(
      await db.enrollmentImportHistory.count({ where: { recordedById: null } }),
      5,
    );
    console.log(
      'OK: histórico de turma/período/série e conferência, idempotência, conflito, outra modalidade, encerrados, credenciais, rollback transacional e referências preservados.',
    );
  } finally {
    try {
      if (constraint)
        await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec057_test_rollback`;
      await db.student.deleteMany({
        where: {
          OR: [
            ...(actorStudentId ? [{ id: actorStudentId }] : []),
            { schoolRegistration: { in: ['00001001', '00001003'] } },
          ],
        },
      });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
