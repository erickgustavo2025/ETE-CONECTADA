import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { schoolHeaderFixture } from './test-sheet-input';
import { hashPassword } from '../src/lib/password';
import { saveCourseCalendar } from '../src/lib/course-calendars';
import { declarationStudent, subsequentContext } from '../src/lib/declarations';
import { readCalendarDraft } from '../src/lib/course-calendar-input';

async function main() {
  const env = await openTestEnvironment({ http: true }),
    { db, base } = env;
  const students: string[] = [],
    scopes: string[] = [];
  let constraint = false;
  try {
    assert.equal(await db.student.count(), 0);
    const password = 'TurmasSinteticas#123';
    const actor = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia turmas',
        birthDate: new Date('2000-01-01'),
        account: {
          create: {
            email: `turmas-${randomUUID()}@eteconectada.invalid`,
            role: 'secretary',
            status: 'active',
            passwordHash: await hashPassword(password),
          },
        },
      },
      include: { account: true },
    });
    students.push(actor.id);
    const pupil = await db.student.create({
      data: {
        schoolRegistration: '00001001',
        fullName: 'Pessoa Fictícia Um',
        birthDate: new Date('2008-02-29'),
        registrationAllowed: false,
        loginBlocked: true,
        issuanceBlocked: true,
        accessRevision: 2,
        details: {
          create: {
            parentOne: 'Filiação Fictícia Um',
            parentTwo: 'Filiação Fictícia Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            courseLabel: 'ADM',
            grade: 1,
            className: 'Integrado preservado',
          },
        },
      },
      include: { enrollments: true },
    });
    students.push(pupil.id);
    const untouched = pupil.enrollments[0];
    const login = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ identifier: actor.account!.email, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const post = (value: object, auth = cookie) =>
      fetch(base + '/api/secretaria/importacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          Cookie: auth,
        },
        body: JSON.stringify({ ...value, format: 'school-header-v1' }),
      });
    const a = schoolHeaderFixture('SUBSEQUENTE', 'DS', 1, '2026.2', 'STDSIN1A');
    const b = schoolHeaderFixture('SUBSEQUENTE', 'DS', 1, '2026.2', 'STDSIN1B');
    const enf = schoolHeaderFixture(
      'SUBSEQUENTE',
      'ENF',
      4,
      '2026.2',
      'STENFN4U',
    );
    b.wb.Sheets['Fictícia'].A7 = { t: 's', v: '00001002' };
    enf.wb.Sheets['Fictícia'].A7 = { t: 's', v: '00001003' };
    XLSX.utils.book_append_sheet(a.wb, b.wb.Sheets['Fictícia'], 'DS B');
    XLSX.utils.book_append_sheet(a.wb, enf.wb.Sheets['Fictícia'], '3 - ENF');
    const payload = () => ({
      mode: 'SUBSEQUENTE',
      fileBase64: a.file().toString('base64'),
    });
    assert.equal(
      (await post({ ...payload(), action: 'inspect' }, '')).status,
      401,
    );
    const inspected = await post({ ...payload(), action: 'inspect' });
    assert.equal(inspected.status, 200);
    const inspection = await inspected.json();
    assert.equal(inspection.sheets.length, 3);
    assert.equal(inspection.sheets[2].stage, 4);
    assert.equal(inspection.sheets[2].reference.entryPeriod, '2025.1');
    assert.equal(JSON.stringify(inspection).includes('Pessoa Fictícia'), false);
    assert.equal(
      await db.courseOffering.count(),
      0,
      'Inspeção não cria referências.',
    );
    const contexts = inspection.sheets.map(
      (h: {
        sheetName: string;
        scopeId: string;
        classCode: string;
        periodLabel: string;
        courseLabel: string;
        stage: number;
      }) => ({
        sheetName: h.sheetName,
        scopeId: h.scopeId,
        className: h.classCode,
        periodLabel: h.periodLabel,
        courseLabel: h.courseLabel,
        stage: h.stage,
        sourceChoice: 'header',
        confirmed: true,
        bindings: {},
      }),
    );
    scopes.push(...contexts.map((c: { scopeId: string }) => c.scopeId));
    assert.equal(
      new Set(scopes).size,
      3,
      'A/B e cursos diferentes não se misturam.',
    );
    const preview = async () => {
      const response = await post({
        ...payload(),
        action: 'preview',
        contexts,
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    let checked = await preview();
    assert.equal(checked.counts.createdEnrollments, 3);
    assert.equal(
      await db.courseOffering.count(),
      0,
      'Prévia não cria referências.',
    );
    const apply = () =>
      post({
        ...payload(),
        action: 'confirm',
        contexts,
        token: checked.token,
        confirmed: true,
      });
    await db.student.update({
      where: { id: pupil.id },
      data: { accessRevision: 3 },
    });
    assert.equal(
      (await apply()).status,
      409,
      'Mudança administrativa invalida a prévia.',
    );
    checked = await preview();
    await db.$executeRaw`ALTER TABLE enrollments ADD CONSTRAINT ec125_rollback CHECK(school_import_key IS NULL OR school_import_key NOT LIKE '%:00001002')`;
    constraint = true;
    assert.equal((await apply()).status, 409);
    assert.equal(
      await db.courseOffering.count(),
      0,
      'Falha reverte as três referências.',
    );
    assert.equal(await db.student.count(), 2, 'Falha reverte alunos novos.');
    assert.equal(await db.enrollment.count(), 1);
    assert.equal(
      (
        await db.sheetImportPreview.findUniqueOrThrow({
          where: { actorId: actor.account!.id },
        })
      ).consumedAt,
      null,
    );
    await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec125_rollback`;
    constraint = false;
    const applied = await apply();
    assert.equal(applied.status, 200);
    const counts = await applied.json();
    assert.deepEqual(await (await apply()).json(), counts);
    assert.equal(await db.courseOffering.count(), 3);
    assert.equal(await db.courseCalendarVersion.count(), 3);
    assert.equal(await db.enrollment.count(), 4);
    const saved = await db.student.findUniqueOrThrow({
      where: { id: pupil.id },
    });
    assert.equal(saved.loginBlocked, true);
    assert.equal(saved.issuanceBlocked, true);
    assert.equal(saved.accessRevision, 3);
    assert.equal(saved.registrationAllowed, false);
    assert.deepEqual(
      await db.enrollment.findUnique({ where: { id: untouched.id } }),
      untouched,
    );
    const emitted = await declarationStudent(db, pupil.id);
    const sub = emitted!.enrollments.find((e) => e.mode === 'SUBSEQUENTE')!;
    assert.deepEqual(subsequentContext(sub, new Date('2026-11-05T12:00:00Z')), {
      moduleNumber: 1,
      startsOn: '2026-08-01',
      endsOn: '2027-12-31',
      courseName: 'Desenvolvimento de Sistemas',
    });
    assert.equal(sub.validFrom!.toISOString().slice(0, 10), '2026-08-01');
    const previousSheet = a.wb.Sheets['DS B'];
    const rows = XLSX.utils.sheet_to_json<string[]>(previousSheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    a.wb.Sheets['DS B'] = XLSX.utils.aoa_to_sheet(rows.slice(0, 6));
    checked = await preview();
    assert.equal(checked.counts.absent, 1);
    assert.equal((await apply()).status, 200);
    assert.equal(
      await db.enrollment.count(),
      4,
      'Ausente não é excluído nem encerrado.',
    );
    a.wb.Sheets['DS B'] = previousSheet;
    const oldVersion = await db.courseCalendarVersion.findFirstOrThrow({
      where: { offeringId: scopes[0] },
    });
    const corrected = readCalendarDraft(oldVersion.schedule);
    corrected.startsOn = '2026-08-03';
    corrected.modules[0].startsOn = '2026-08-03';
    await saveCourseCalendar(
      db,
      actor.account!.id,
      scopes[0],
      1,
      corrected,
      true,
    );
    checked = await preview();
    assert.equal(
      checked.sheets[0].reference.startsOn,
      '2026-08-03',
      'Referência corrigida prevalece sobre estimativa.',
    );
    assert.equal((await apply()).status, 200);
    assert.equal(
      await db.courseCalendarVersion.count({
        where: { offeringId: scopes[0] },
      }),
      2,
    );
    assert.deepEqual(
      await db.courseCalendarVersion.findUnique({
        where: { id: oldVersion.id },
      }),
      oldVersion,
      'Versão inicial preservada.',
    );
    // Repetente/transferência prévia: arquivo antigo não desfaz a colocação nem cria vínculo paralelo silencioso.
    await db.enrollment.update({
      where: { id: sub.id },
      data: {
        moduleNumber: 2,
        calendarModule: 2,
        periodLabel: '2027.1',
        progressionHeld: true,
      },
    });
    checked = await preview();
    assert.equal(checked.counts.conflicts, 1);
    assert.equal((await apply()).status, 409);
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: sub.id } }))
        .moduleNumber,
      2,
    );
    const legacy = await fetch(base + '/api/secretaria/importacao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        Cookie: cookie,
      },
      body: JSON.stringify({
        ...payload(),
        action: 'preview',
        contexts: contexts.map((c: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(c).filter(([key]) => key !== 'sourceChoice'),
          ),
        ),
      }),
    });
    assert.equal(legacy.status, 200);
    assert.equal(
      (await legacy.json()).counts.conflicts,
      1,
      'Retirar a versão da requisição não contorna a proteção de colocação.',
    );
    // Fonte anterior inexistente é recusada, mesmo com UUID bem formado.
    const forged = await post({
      ...payload(),
      action: 'preview',
      contexts: contexts.map((c: object, index: number) =>
        index ? c : { ...c, scopeId: randomUUID(), sourceChoice: 'existing' },
      ),
    });
    assert.equal(forged.status, 409);
    await db.account.update({
      where: { id: actor.account!.id },
      data: { role: 'student' },
    });
    assert.equal((await post({ ...payload(), action: 'inspect' })).status, 403);
    console.log(
      'OK: importação automática A/B/ENF4, prévia sem escrita, referências estimadas/corrigidas, rollback, replay, bloqueios, vínculo integrado e colocação preservados, fonte forjada e papel trocado recusados.',
    );
  } finally {
    try {
      if (constraint)
        await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec125_rollback`;
      await db.student.deleteMany({
        where: {
          OR: [
            { id: { in: students } },
            {
              schoolRegistration: { in: ['00001001', '00001002', '00001003'] },
            },
          ],
        },
      });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: scopes } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: scopes } } });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
