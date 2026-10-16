import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { sheetFixture } from './test-sheet-input';
import { reviewEnrollment } from '../src/lib/enrollment-validity';
import {
  SHEET_BODY_LIMIT,
  parseSheetInput,
  SheetImportError,
} from '../src/lib/sheet-import-input';
import { previewSheetImport } from '../src/lib/sheet-import';

async function main() {
  const env = await openTestEnvironment({ http: true }),
    { db, base } = env;
  const ids: string[] = [];
  const registrations = [
    '00001001',
    '00001002',
    '00001003',
    '00001005',
    '00009999',
  ];
  let constraint = false;
  try {
    assert.equal(
      await db.student.count(),
      0,
      'Exige banco novo, não a demonstração.',
    );
    const actors: Array<{ id: string; cookie: string }> = [];
    for (let i = 0; i < 3; i++) {
      const student = await db.student.create({
        data: {
          fullName: 'Operador sintético importação',
          birthDate: new Date('2000-01-01'),
        },
      });
      ids.push(student.id);
      const account = await db.account.create({
        data: {
          studentId: student.id,
          role: i < 2 ? 'secretary' : 'student',
          status: 'active',
          email: `import-${randomUUID()}@eteconectada.invalid`,
          passwordHash: 'hash-ficticio-sem-login',
        },
      });
      const token = randomBytes(32).toString('base64url');
      await db.session.create({
        data: {
          accountId: account.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      actors.push({ id: account.id, cookie: `ete_portal_session=${token}` });
    }
    const post = (body: unknown, cookie = actors[0].cookie, origin = base) =>
      fetch(`${base}/api/secretaria/importacao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    const fixture = sheetFixture();
    const payload = () => ({
      action: 'preview',
      fileBase64: fixture.file().toString('base64'),
      mode: 'INTEGRADO',
      contexts: [fixture.context],
    });
    const preview = async (body: Record<string, unknown> = payload()) => {
      const r = await post(body);
      assert.equal(r.status, 200, 'Prévia deve funcionar no handler real.');
      return { body, value: await r.json() };
    };
    const confirm = (
      p: Awaited<ReturnType<typeof preview>>,
      extra: Record<string, unknown> = {},
    ) =>
      post({
        ...p.body,
        action: 'confirm',
        token: p.value.token,
        confirmed: true,
        ...extra,
      });
    assert.equal((await post({}, '')).status, 401);
    assert.equal((await post({}, actors[2].cookie)).status, 403);
    assert.equal(
      (await post({}, actors[0].cookie, 'https://example.invalid')).status,
      403,
    );
    assert.equal(
      (
        await post({
          action: 'preview',
          fileBase64: 'arquivo.xls',
          mode: 'INTEGRADO',
          contexts: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (await post({ ...payload(), mode: 'SUBSEQUENTE' })).status,
      422,
    );
    const streamed = await fetch(`${base}/api/secretaria/importacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        Cookie: actors[0].cookie,
      },
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(SHEET_BODY_LIMIT + 1));
          c.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    assert.equal(streamed.status, 413, 'Sem Content-Length também há limite.');
    await assert.rejects(
      previewSheetImport(
        db,
        actors[2].id,
        await parseSheetInput(fixture.file(), 'INTEGRADO', [fixture.context]),
      ),
      (error) => error instanceof SheetImportError && error.status === 403,
    );
    assert.equal(
      (await post({ ...payload(), action: ['preview'] })).status,
      400,
    );
    const importPage = await fetch(`${base}/secretaria/importacao/integrado`, {
      headers: { Cookie: actors[0].cookie },
    });
    assert.equal(importPage.status, 200);
    const html = await importPage.text();
    const form = html.match(/<form\b[^>]*>/i)?.[0];
    assert.ok(
      form && /method="post"/i.test(form),
      'Sem JavaScript o formulário não deve enviar nome de arquivo na URL.',
    );
    const inspectBody = {
      action: 'inspect',
      mode: 'INTEGRADO',
      fileBase64: fixture.file().toString('base64'),
    };
    assert.equal((await post(inspectBody, '')).status, 401);
    assert.equal((await post(inspectBody, actors[2].cookie)).status, 403);
    assert.equal(
      (await post(inspectBody, actors[0].cookie, 'https://example.invalid'))
        .status,
      403,
    );
    assert.equal(
      (await post({ ...inspectBody, mode: 'SUBSEQUENTE' })).status,
      422,
    );
    assert.equal((await post({ ...inspectBody, contexts: [] })).status, 400);
    const inspected = await post(inspectBody);
    assert.equal(inspected.status, 200);
    assert.match(
      inspected.headers.get('cache-control') || '',
      /private.*no-store/,
    );
    const inspection = await inspected.json();
    assert.deepEqual(inspection.sources, []);
    assert.deepEqual(inspection.sheets, [
      { sheetName: 'Fictícia', courseLabel: 'ADM', stage: 1, rows: 1 },
    ]);
    assert.equal(JSON.stringify(inspection).includes('Pessoa Fictícia'), false);
    assert.equal(
      await db.sheetImportPreview.count(),
      0,
      'Inspeção não cria token nem altera cadastros.',
    );
    const first = await preview();
    assert.equal(first.value.counts.createdStudents, 1);
    assert.equal(first.value.counts.identityChanges, 0);
    assert.equal(await db.student.count(), 3, 'Prévia não altera cadastros.');
    assert.equal((await confirm(first, { confirmed: false })).status, 422);
    assert.equal(
      (
        await post(
          {
            ...first.body,
            action: 'confirm',
            token: first.value.token,
            confirmed: true,
          },
          actors[1].cookie,
        )
      ).status,
      409,
      'Token não pode mudar de operador.',
    );
    assert.equal((await confirm(first, { token: 'x'.repeat(43) })).status, 409);
    assert.equal(
      (
        await confirm(first, {
          contexts: [{ ...fixture.context, className: 'Outro nome fictício' }],
        })
      ).status,
      409,
      'O contexto não pode mudar depois da prévia.',
    );
    const applied = await confirm(first);
    assert.equal(applied.status, 200);
    const appliedCounts = await applied.json();
    assert.equal(appliedCounts.createdStudents, 1);
    assert.deepEqual(
      await (await confirm(first)).json(),
      appliedCounts,
      'Repetição da confirmação não duplica.',
    );
    const knownSources = await (await post(inspectBody)).json();
    assert.equal(knownSources.sources.length, 1);
    assert.equal(knownSources.sources[0].scopeId, fixture.context.scopeId);
    assert.equal(knownSources.sources[0].className, fixture.context.className);
    const imported = await db.student.findUniqueOrThrow({
      where: { schoolRegistration: '00001001' },
      include: { enrollments: true, details: true, account: true },
    });
    assert.equal(imported.registrationAllowed, false);
    assert.equal(imported.account, null);
    assert.equal(imported.cpf, null);
    assert.equal(imported.enrollments.length, 1);
    assert.equal(imported.enrollments[0].status, 'UNCONFIRMED');
    assert.equal(imported.details?.parentTwo, 'Filiação Fictícia Dois');
    const same = await preview();
    assert.equal(same.value.counts.unchanged, 1);
    assert.equal((await confirm(same)).status, 200);
    await reviewEnrollment(db, actors[0].id, imported.enrollments[0].id, {
      status: 'ACTIVE',
      periodLabel: '2026',
      validFrom: '2000-01-01',
      validUntil: '2099-12-31',
    });
    await db.student.update({
      where: { id: imported.id },
      data: { cpf: '45278196319', registrationAllowed: true },
    });
    const closed = await db.enrollment.create({
      data: {
        studentId: imported.id,
        mode: 'INTEGRADO',
        className: 'Histórico fictício',
        grade: 1,
        courseLabel: 'DS',
        status: 'ENDED',
      },
    });
    const protectedAccount = await db.account.create({
      data: {
        studentId: imported.id,
        email: 'protegido@eteconectada.invalid',
        passwordHash: 'hash-ficticio-preservado',
        status: 'active',
        role: 'student',
      },
    });
    await db.session.create({
      data: {
        accountId: protectedAccount.id,
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    fixture.wb.Sheets['Fictícia'].B7 = {
      t: 's',
      v: 'Pessoa Fictícia Atualizada',
    };
    fixture.wb.Sheets['Fictícia'].I7 = { t: 's', v: 'Filiação Fictícia Um' };
    const changed = await preview();
    assert.equal(changed.value.counts.identityChanges, 1);
    assert.equal((await confirm(changed)).status, 409);
    assert.equal(
      (await confirm(changed, { acceptIdentityChanges: true })).status,
      200,
    );
    const after = await db.student.findUniqueOrThrow({
      where: { id: imported.id },
      include: {
        details: true,
        enrollments: true,
        account: { include: { sessions: true } },
      },
    });
    assert.equal(after.fullName, 'Pessoa Fictícia Atualizada');
    assert.equal(after.details?.parentTwo, 'Filiação Fictícia Dois');
    assert.equal(after.cpf, '45278196319');
    assert.equal(after.registrationAllowed, true);
    assert.equal(after.account?.email, protectedAccount.email);
    assert.equal(after.account?.passwordHash, 'hash-ficticio-preservado');
    assert.equal(after.account?.role, 'student');
    assert.equal(after.account?.sessions.length, 1);
    assert.equal(
      after.enrollments.find(
        (enrollment) => enrollment.id === imported.enrollments[0].id,
      )?.status,
      'UNCONFIRMED',
    );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: closed.id } }))
        .status,
      'ENDED',
      'Correção de identidade preserva matrícula encerrada.',
    );
    const stale = await preview();
    await db.student.update({
      where: { id: imported.id },
      data: { fullName: 'Correção sintética posterior' },
    });
    assert.equal(
      (await confirm(stale, { acceptIdentityChanges: true })).status,
      409,
      'Prévia antiga não pode apagar alteração concorrente.',
    );
    await db.student.update({
      where: { id: imported.id },
      data: { fullName: 'Pessoa Fictícia Atualizada' },
    });
    await db.studentDetails.update({
      where: { studentId: imported.id },
      data: { parentageSource: 'SECRETARY_CORRECTION' },
    });
    fixture.wb.Sheets['Fictícia'].I7 = { t: 's', v: 'Outra Filiação Fictícia' };
    const protectedParents = await preview();
    assert.equal(protectedParents.value.counts.conflicts, 1);
    assert.equal(
      (await confirm(protectedParents, { acceptIdentityChanges: true })).status,
      409,
    );
    fixture.wb.Sheets['Fictícia'].I7 = { t: 's', v: 'Filiação Fictícia Um' };
    const absent = await db.student.create({
      data: {
        schoolRegistration: '00009999',
        fullName: 'Ausente fictício',
        birthDate: new Date('2000-01-01'),
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: fixture.context.className,
            courseLabel: 'ADM',
            grade: 1,
            schoolImportKey: `school:${fixture.context.scopeId}:00009999`,
            status: 'ENDED',
          },
        },
      },
    });
    const absence = await preview();
    assert.equal(absence.value.counts.absent, 1);
    assert.equal((await confirm(absence)).status, 200);
    assert.equal(
      (
        await db.enrollment.findFirstOrThrow({
          where: { studentId: absent.id },
        })
      ).status,
      'ENDED',
    );
    const sub = sheetFixture('SUBSEQUENTE');
    sub.wb.Sheets['Fictícia'].B7 = { t: 's', v: 'Pessoa Fictícia Atualizada' };
    sub.wb.Sheets['Fictícia'].I7 = { t: 's', v: 'Filiação Fictícia Um' };
    const badMode = await post({
      action: 'preview',
      fileBase64: sub.file().toString('base64'),
      mode: 'SUBSEQUENTE',
      contexts: [
        {
          ...sub.context,
          bindings: { '00001001': imported.enrollments[0].id },
        },
      ],
    });
    assert.equal(badMode.status, 200);
    assert.equal((await badMode.json()).counts.conflicts, 1);
    const subPreview = await post({
      action: 'preview',
      fileBase64: sub.file().toString('base64'),
      mode: 'SUBSEQUENTE',
      contexts: [sub.context],
    });
    assert.equal(subPreview.status, 200);
    const subResult = await subPreview.json();
    assert.equal(subResult.counts.createdStudents, 0);
    assert.equal(subResult.counts.createdEnrollments, 1);
    assert.equal(
      (
        await post({
          action: 'confirm',
          fileBase64: sub.file().toString('base64'),
          mode: 'SUBSEQUENTE',
          contexts: [sub.context],
          token: subResult.token,
          confirmed: true,
        })
      ).status,
      200,
    );
    const subsequent = await db.enrollment.findFirstOrThrow({
      where: { studentId: imported.id, mode: 'SUBSEQUENTE' },
    });
    assert.equal(subsequent.moduleNumber, 1);
    assert.equal(subsequent.grade, null);
    assert.equal(
      await db.enrollment.count({ where: { studentId: imported.id } }),
      3,
    );
    const closedFixture = sheetFixture();
    closedFixture.wb.Sheets['Fictícia'].A3 = {
      t: 's',
      v: 'Ensino Médio - Técnico em Desenvolvimento de Sistemas',
    };
    closedFixture.wb.Sheets['Fictícia'].B7 = {
      t: 's',
      v: 'Pessoa Fictícia Atualizada',
    };
    closedFixture.wb.Sheets['Fictícia'].I7 = {
      t: 's',
      v: 'Filiação Fictícia Um',
    };
    const closedPreview = await preview({
      action: 'preview',
      fileBase64: closedFixture.file().toString('base64'),
      mode: 'INTEGRADO',
      contexts: [
        {
          ...closedFixture.context,
          courseLabel: 'DS',
          bindings: { '00001001': closed.id },
        },
      ],
    });
    assert.equal(
      closedPreview.value.counts.conflicts,
      1,
      'Metadados de matrícula encerrada não são substituídos pelo arquivo.',
    );
    assert.equal((await confirm(closedPreview)).status, 409);
    const expired = await preview();
    await db.sheetImportPreview.update({
      where: { actorId: actors[0].id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal((await confirm(expired)).status, 409);
    const legacyFixture = sheetFixture();
    legacyFixture.wb.Sheets['Fictícia'].A7 = { t: 's', v: '00001005' };
    const legacy = await db.student.create({
      data: {
        schoolRegistration: '00001005',
        fullName: 'Pessoa Fictícia Um',
        birthDate: new Date('2008-02-29'),
        registrationAllowed: false,
        importSourceId: 'backup-alunos:ffffffffffffffffffffffff',
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: legacyFixture.context.className,
            grade: 1,
            courseLabel: 'ADM',
            importSourceId: 'backup-alunos:ffffffffffffffffffffffff',
          },
        },
      },
      include: { enrollments: true },
    });
    const legacyBody = {
      action: 'preview',
      fileBase64: legacyFixture.file().toString('base64'),
      mode: 'INTEGRADO',
      contexts: [legacyFixture.context],
    };
    const legacyConflict = (await preview(legacyBody)).value;
    assert.equal(
      legacyConflict.counts.conflicts,
      1,
      'Vínculo legado exige associação conferida.',
    );
    assert.equal(legacyConflict.entries[0].needsBinding, true);
    assert.equal(
      legacyConflict.entries[0].candidates[0].id,
      legacy.enrollments[0].id,
    );
    assert.equal(
      legacyConflict.entries[0].candidates[0].className,
      legacyFixture.context.className,
    );
    const linked = await preview({
      ...legacyBody,
      contexts: [
        {
          ...legacyFixture.context,
          bindings: { '00001005': legacy.enrollments[0].id },
        },
      ],
    });
    assert.equal(
      (await confirm(linked, { acceptIdentityChanges: true })).status,
      200,
    );
    const legacyAfter = await db.enrollment.findUniqueOrThrow({
      where: { id: legacy.enrollments[0].id },
    });
    assert.equal(
      legacyAfter.importSourceId,
      'backup-alunos:ffffffffffffffffffffffff',
    );
    assert.ok(legacyAfter.schoolImportKey);
    assert.equal(
      await db.enrollment.count({ where: { studentId: legacy.id } }),
      1,
    );
    const bulk = sheetFixture();
    bulk.wb.Sheets['Fictícia'].A7 = { t: 's', v: '00001002' };
    XLSX.utils.sheet_add_aoa(
      bulk.wb.Sheets['Fictícia'],
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
    const bulkBody = {
      action: 'preview',
      fileBase64: bulk.file().toString('base64'),
      mode: 'INTEGRADO',
      contexts: [bulk.context],
    };
    const beforeRollback = await preview(bulkBody);
    // Banco novo identificado: o alvo é uma matrícula exclusivamente sintética.
    await db.$executeRaw`ALTER TABLE enrollments ADD CONSTRAINT ec056_test_rollback CHECK (school_import_key NOT LIKE '%:00001003')`;
    constraint = true;
    assert.equal((await confirm(beforeRollback)).status, 409);
    assert.equal(
      await db.student.count({
        where: { schoolRegistration: { in: ['00001002', '00001003'] } },
      }),
      0,
      'Falha na segunda matrícula reverte inclusive a primeira pessoa.',
    );
    assert.equal(
      (
        await db.sheetImportPreview.findUniqueOrThrow({
          where: { actorId: actors[0].id },
        })
      ).consumedAt,
      null,
    );
    await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec056_test_rollback`;
    constraint = false;
    assert.equal((await confirm(beforeRollback)).status, 200);
    const last = await preview();
    await db.account.update({
      where: { id: actors[0].id },
      data: { role: 'student' },
    });
    assert.equal((await confirm(last)).status, 403);
    console.log(
      'OK: upload HTTP, autorização, prévia sem alterar cadastros, confirmação vinculada, expiração, idempotência, atualização explícita, dados protegidos, ausentes, conflito de modalidade, concorrência e rollback após escrita.',
    );
  } finally {
    try {
      if (constraint)
        await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec056_test_rollback`;
      await db.student.deleteMany({
        where: {
          OR: [
            { id: { in: ids } },
            { schoolRegistration: { in: registrations } },
          ],
        },
      });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
