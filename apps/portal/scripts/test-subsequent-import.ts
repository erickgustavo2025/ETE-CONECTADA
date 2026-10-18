import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import * as XLSX from 'xlsx';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { sheetFixture } from './test-sheet-input';
import { hashPassword } from '../src/lib/password';
import { saveCourseCalendar } from '../src/lib/course-calendars';
async function main() {
  const env = await openTestEnvironment({ http: true }),
    { db, base } = env;
  const students: string[] = [],
    offers: string[] = [];
  let rollbackConstraint = false;
  let rollbackRegistrationReserved = false;
  try {
    assert.equal(await db.student.count(), 0, 'Exige banco novo sintético.');
    rollbackRegistrationReserved = true;
    const password = 'SubsequenteSintetico#123';
    const actor = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia subsequente',
        birthDate: new Date('2000-01-15'),
        account: {
          create: {
            email: `sub-${randomUUID()}@eteconectada.invalid`,
            passwordHash: await hashPassword(password),
            status: 'active',
            role: 'secretary',
          },
        },
      },
      include: { account: true },
    });
    students.push(actor.id);
    const login = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ identifier: actor.account!.email, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const post = (body: object, auth = cookie) =>
      fetch(base + '/api/secretaria/importacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          Cookie: auth,
        },
        body: JSON.stringify(body),
      });
    const year = new Date().getUTCFullYear();
    for (const courseLabel of ['ADM', 'DS', 'ENF'] as const) {
      const count = courseLabel === 'ENF' ? 4 : 3,
        id = randomUUID();
      offers.push(id);
      const draft = {
        label: `Oferta fictícia ${courseLabel}`,
        courseLabel,
        startsOn: `${year}-01-01`,
        endsOn: `${year + count - 1}-12-31`,
        modules: Array.from({ length: count }, (_, i) => ({
          number: i + 1,
          startsOn: `${year + i}-01-01`,
          endsOn: `${year + i}-12-31`,
          periodLabel: `Período fictício ${i + 1}`,
        })),
      };
      await saveCourseCalendar(db, actor.account!.id, id, 0, draft, true);
      const sheet = sheetFixture('SUBSEQUENTE'),
        registration =
          courseLabel === 'DS'
            ? `0${randomInt(10000, 99999)}`
            : String(randomInt(10000000, 99999999));
      sheet.wb.Sheets['Fictícia'].A3 = {
        t: 's',
        v: `Técnico em ${courseLabel} - Subsequente`,
      };
      sheet.wb.Sheets['Fictícia'].A7 = { t: 's', v: registration };
      const input = {
        action: 'inspect',
        mode: 'SUBSEQUENTE',
        fileBase64: sheet.file().toString('base64'),
      };
      assert.equal((await post(input, '')).status, 401);
      const inspected = await post(input);
      assert.equal(
        inspected.status,
        200,
        'A inspeção explícita do subsequente deve funcionar.',
      );
      assert.match(
        inspected.headers.get('cache-control') || '',
        /private.*no-store/,
      );
      const inspection = await inspected.json(),
        source = inspection.sources.find(
          (s: { scopeId: string }) => s.scopeId === id,
        );
      assert.equal(inspection.sheets[0].courseLabel, courseLabel);
      assert.equal(source.calendar.modules.length, count);
      assert.equal(
        source.calendar.modules[0].periodLabel,
        draft.modules[0].periodLabel,
      );
      assert.equal(source.calendar.currentModule, 1);
      assert.equal(
        JSON.stringify(inspection).includes('Pessoa Fictícia'),
        false,
        'Inspeção não expõe dados pessoais.',
      );
      assert.equal(
        await db.student.count({ where: { schoolRegistration: registration } }),
        0,
      );
      assert.equal((await post({ ...input, mode: 'INTEGRADO' })).status, 422);
      const person = await db.student.create({
        data: {
          schoolRegistration: registration,
          fullName: 'Pessoa Fictícia Um',
          birthDate: new Date('2008-02-29'),
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
      students.push(person.id);
      const context = {
        ...sheet.context,
        scopeId: id,
        courseLabel,
        periodLabel: draft.modules[0].periodLabel,
      };
      const payload = () => ({
        mode: 'SUBSEQUENTE',
        fileBase64: sheet.file().toString('base64'),
        contexts: [context],
      });
      const previewResponse = await post({ action: 'preview', ...payload() });
      assert.equal(previewResponse.status, 200);
      const preview = await previewResponse.json();
      assert.equal(preview.calendarComparisons[0].differs, false);
      const confirmed = await post({
        action: 'confirm',
        ...payload(),
        token: preview.token,
        confirmed: true,
      });
      assert.equal(confirmed.status, 200);
      const result = await confirmed.json();
      assert.equal(result.createdStudents, 0);
      assert.equal(result.createdEnrollments, 1);
      const sub = await db.enrollment.findFirstOrThrow({
        where: { studentId: person.id, mode: 'SUBSEQUENTE' },
      });
      assert.equal(sub.offeringId, id);
      assert.equal(sub.progressionHeld, true);
      assert.equal(
        (
          await db.enrollment.findUniqueOrThrow({
            where: { id: person.enrollments[0].id },
          })
        ).grade,
        1,
      );
      const repeated = await post({ action: 'preview', ...payload() });
      const same = await repeated.json();
      assert.equal(same.counts.unchanged, 1);
      assert.equal(
        (
          await post({
            action: 'confirm',
            ...payload(),
            token: same.token,
            confirmed: true,
          })
        ).status,
        200,
      );
      assert.equal(
        await db.account.count({ where: { studentId: person.id } }),
        0,
      );
      sheet.wb.Sheets['Fictícia'].A4 = {
        t: 's',
        v: `${count}MODULO - TURMA-FICTICIA`,
      };
      context.stage = count;
      context.periodLabel = draft.modules[count - 1].periodLabel;
      const changed = await post({ action: 'preview', ...payload() });
      const difference = await changed.json();
      assert.equal(difference.calendarComparisons[0].differs, true);
      assert.equal(
        (
          await post({
            action: 'confirm',
            ...payload(),
            token: difference.token,
            confirmed: true,
          })
        ).status,
        409,
      );
      const fresh = await post({ action: 'preview', ...payload() });
      const refreshed = await fresh.json();
      assert.equal(
        (
          await post({
            action: 'confirm',
            ...payload(),
            token: refreshed.token,
            confirmed: true,
            acceptCalendarDifferences: true,
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.enrollment.findUniqueOrThrow({ where: { id: sub.id } }))
          .moduleNumber,
        count,
      );
      assert.equal(
        await db.enrollmentImportHistory.count({
          where: { enrollmentId: sub.id },
        }),
        1,
      );
      sheet.wb.Sheets['Fictícia'].A4 = {
        t: 's',
        v: `${count + 1}MODULO - TURMA-FICTICIA`,
      };
      assert.equal(
        (await post({ ...input, fileBase64: sheet.file().toString('base64') }))
          .status,
        422,
      );
      // O lote altera uma pessoa existente antes de falhar na segunda linha.
      sheet.wb.Sheets['Fictícia'].A4 = {
        t: 's',
        v: `${count}MODULO - TURMA-FICTICIA`,
      };
      const snapshot = async () => ({
        person: await db.student.findUniqueOrThrow({
          where: { id: person.id },
          include: { details: true, enrollments: { orderBy: { id: 'asc' } } },
        }),
        history: await db.enrollmentImportHistory.findMany({
          where: { enrollmentId: sub.id },
          orderBy: { id: 'asc' },
        }),
        offering: await db.courseOffering.findUniqueOrThrow({ where: { id } }),
      });
      const beforeRollback = await snapshot();
      sheet.wb.Sheets['Fictícia'].B7 = {
        t: 's',
        v: 'Pessoa Fictícia Corrigida no Lote',
      };
      XLSX.utils.sheet_add_aoa(
        sheet.wb.Sheets['Fictícia'],
        [['00001009', 'Outra Pessoa Fictícia', '01/01/2000']],
        { origin: 'A8' },
      );
      const batchResponse = await post({ action: 'preview', ...payload() });
      assert.equal(batchResponse.status, 200);
      const batch = await batchResponse.json();
      assert.equal(batch.counts.createdStudents, 1);
      assert.equal(batch.counts.updatedStudents, 1);
      assert.deepEqual(
        await snapshot(),
        beforeRollback,
        'Prévia não grava o lote.',
      );
      const applyBatch = () =>
        post({
          action: 'confirm',
          ...payload(),
          token: batch.token,
          confirmed: true,
          acceptIdentityChanges: true,
          acceptCalendarDifferences: true,
        });
      await db.$executeRaw`ALTER TABLE enrollments ADD CONSTRAINT ec109_sub_rollback CHECK (school_import_key NOT LIKE '%:00001009')`;
      rollbackConstraint = true;
      assert.equal((await applyBatch()).status, 409);
      assert.deepEqual(
        await snapshot(),
        beforeRollback,
        `Rollback ${courseLabel} preserva pessoa, vínculos, histórico e calendário.`,
      );
      assert.equal(
        await db.student.count({ where: { schoolRegistration: '00001009' } }),
        0,
      );
      assert.equal(
        (
          await db.sheetImportPreview.findUniqueOrThrow({
            where: { actorId: actor.account!.id },
          })
        ).consumedAt,
        null,
        'Falha não consome a autorização da prévia.',
      );
      await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec109_sub_rollback`;
      rollbackConstraint = false;
      const recovered = await applyBatch();
      assert.equal(recovered.status, 200);
      const counts = await recovered.json();
      assert.equal(counts.createdStudents, 1);
      assert.equal(counts.updatedStudents, 1);
      assert.deepEqual(
        await (await applyBatch()).json(),
        counts,
        'Repetição do token retorna o resultado sem duplicar.',
      );
      assert.equal(
        await db.student.count({ where: { schoolRegistration: '00001009' } }),
        1,
      );
      assert.equal(
        (await db.student.findUniqueOrThrow({ where: { id: person.id } }))
          .fullName,
        'Pessoa Fictícia Corrigida no Lote',
      );
      await db.student.delete({ where: { schoolRegistration: '00001009' } });
    }
    console.log(
      'OK: inspeção/catálogos privados do subsequente ADM/DS/Enfermagem, módulos3/4, modalidade, calendário, reimportação, exceção explícita, histórico, rollback de lote com recuperação e repetição, integrado/contas preservados.',
    );
  } finally {
    try {
      if (rollbackConstraint)
        await db.$executeRaw`ALTER TABLE enrollments DROP CONSTRAINT ec109_sub_rollback`;
      if (rollbackRegistrationReserved)
        await db.student.deleteMany({
          where: { schoolRegistration: '00001009' },
        });
      await db.student.deleteMany({ where: { id: { in: students } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offers } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offers } } });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
