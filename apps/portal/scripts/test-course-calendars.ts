import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { hashPassword } from '../src/lib/password';
import { sheetFixture } from './test-sheet-input';
import {
  saveCourseCalendar,
  setCourseProgression,
  listCourseOfferings,
} from '../src/lib/course-calendars';
import {
  reviewEnrollment,
  requireCurrentEnrollment,
} from '../src/lib/enrollment-validity';
import {
  CalendarError,
  type CalendarDraft,
} from '../src/lib/course-calendar-input';
async function main() {
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  const importedRegistrations: string[] = [];
  const students: string[] = [],
    offerIds: string[] = [];
  const post = (body: unknown, cookie = '', origin = base) =>
    fetch(base + '/api/secretaria/calendarios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post({ action: 'list' })).status,
      401,
      'Calendário exige sessão antes de ler o corpo.',
    );
    const accounts = [];
    const password = 'SenhaCalendario#123';
    for (const role of ['secretary', 'student']) {
      const student = await db.student.create({
        data: {
          fullName: 'Calendário sintético ' + role,
          birthDate: new Date('2000-01-15'),
          schoolRegistration: String(randomInt(10000000, 99999999)),
          account: {
            create: {
              email: `calendar-${randomUUID()}@eteconectada.invalid`,
              passwordHash: await hashPassword(password),
              status: 'active',
              role,
            },
          },
        },
        include: { account: true },
      });
      students.push(student.id);
      accounts.push(student.account!);
    }
    const [staff, student] = accounts;
    const login = async (email: string) => {
      const r = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ identifier: email, password }),
      });
      assert.equal(r.status, 200);
      return r.headers.get('set-cookie')!.split(';')[0];
    };
    const cookie = await login(staff.email!),
      studentCookie = await login(student.email!);
    assert.equal((await post({ action: 'list' }, studentCookie)).status, 403);
    assert.equal(
      (await post({ action: 'list' }, cookie, 'https://foreign.invalid'))
        .status,
      403,
    );
    assert.equal(
      (await post({ action: 'list', now: '2030-01-01' }, cookie)).status,
      410,
    );
    assert.equal(
      (await post({ action: 'list', padding: 'x'.repeat(5000) }, cookie))
        .status,
      410,
    );
    await assert.rejects(
      saveCourseCalendar(db, student.id, randomUUID(), 0, {}, true),
      CalendarError,
    );
    const now = new Date(),
      year = now.getUTCFullYear(),
      startMonth = now.getUTCMonth() < 6 ? 0 : 6;
    const iso = (y: number, m: number, d = 1) =>
      new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
    // Calendário inteiramente sintético relativo ao semestre do teste, não regra de produção.
    const make = (courseLabel: 'ADM' | 'DS' | 'ENF'): CalendarDraft => {
      const count = courseLabel === 'ENF' ? 4 : 3;
      return {
        label: 'Oferta fictícia ' + courseLabel,
        courseLabel,
        startsOn: iso(year, startMonth),
        endsOn: iso(year, startMonth + count * 6, 0),
        modules: Array.from({ length: count }, (_, i) => {
          const date = new Date(Date.UTC(year, startMonth + i * 6, 1));
          return {
            number: i + 1,
            startsOn: iso(year, startMonth + i * 6),
            endsOn: iso(year, startMonth + (i + 1) * 6, 0),
            periodLabel: `${date.getUTCFullYear()}.${date.getUTCMonth() < 6 ? 1 : 2}`,
          };
        }),
      };
    };
    const draft = make('DS'),
      offeringId = randomUUID();
    offerIds.push(offeringId);
    assert.equal(
      (
        await post(
          { action: 'save', offeringId, revision: 0, draft, confirmed: true },
          cookie,
        )
      ).status,
      410,
    );
    assert.equal(
      await db.courseOffering.count({ where: { id: offeringId } }),
      0,
    );
    // Serviço interno preserva dados e correções versionadas; o endpoint manual foi encerrado.
    const save = await saveCourseCalendar(
      db,
      staff.id,
      offeringId,
      0,
      draft,
      true,
    );
    assert.equal(save.revision, 1);
    assert.deepEqual(
      await saveCourseCalendar(db, staff.id, offeringId, 0, draft, true),
      { id: offeringId, revision: 1 },
      'Reenvio da criação não duplica oferta/versão.',
    );
    assert.equal(
      await db.courseCalendarVersion.count({ where: { offeringId } }),
      1,
    );
    const initial = draft.modules[0];
    const enrollment = async (
      status: 'ACTIVE' | 'ENDED' | 'UNCONFIRMED' = 'ACTIVE',
      mode: 'SUBSEQUENTE' | 'INTEGRADO' = 'SUBSEQUENTE',
      held = true,
    ) =>
      db.enrollment.create({
        data: {
          studentId: student.studentId,
          mode,
          className: 'Turma fictícia A',
          courseLabel: 'DS',
          grade: mode === 'INTEGRADO' ? 1 : null,
          moduleNumber: mode === 'SUBSEQUENTE' ? 1 : null,
          status,
          periodLabel: initial.periodLabel,
          validFrom: new Date(initial.startsOn),
          validUntil: new Date(initial.endsOn),
          reviewedAt: status === 'ACTIVE' ? now : null,
          reviewedById: status === 'ACTIVE' ? staff.id : null,
          ...(mode === 'SUBSEQUENTE'
            ? {
                offeringId,
                calendarModule: 1,
                calendarRevision: 1,
                progressionHeld: held,
              }
            : {}),
        },
      });
    const active = await enrollment('ACTIVE', 'SUBSEQUENTE', false),
      held = await enrollment(),
      ended = await enrollment('ENDED', 'SUBSEQUENTE', false),
      unconfirmed = await enrollment('UNCONFIRMED', 'SUBSEQUENTE', false),
      integrated = await enrollment('ACTIVE', 'INTEGRADO');
    const untouched = await db.enrollment.findMany({
      where: { id: { in: [held.id, ended.id, unconfirmed.id, integrated.id] } },
      orderBy: { id: 'asc' },
    });
    const atTurn = new Date(draft.modules[1].startsOn + 'T03:00:00Z');
    assert.deepEqual(
      (await listCourseOfferings(db, staff.id, new Date(atTurn.getTime() - 1)))
        .changes,
      { advanced: 0, held: 0, updatedDates: 0 },
    );
    const simultaneous = await Promise.all([
      listCourseOfferings(db, staff.id, atTurn),
      listCourseOfferings(db, staff.id, atTurn),
    ]);
    assert.equal(
      simultaneous.reduce((n, r) => n + r.changes.advanced, 0),
      1,
      'Uma progressão mesmo com chamadas concorrentes.',
    );
    await assert.rejects(
      db.enrollment.update({
        where: { id: active.id },
        data: { calendarModule: null },
      }),
    );
    await assert.rejects(
      db.courseOffering.update({
        where: { id: offeringId },
        data: { lastImportAt: new Date() },
      }),
    );
    const after = await db.enrollment.findUniqueOrThrow({
      where: { id: active.id },
    });
    assert.equal(after.moduleNumber, 2);
    assert.equal(after.status, 'UNCONFIRMED');
    assert.equal(after.reviewedAt, null);
    assert.equal(after.periodLabel, draft.modules[1].periodLabel);
    assert.throws(() => requireCurrentEnrollment(after), /conferência/);
    assert.equal(
      await db.enrollmentImportHistory.count({
        where: { enrollmentId: active.id, reason: 'CALENDAR_PROGRESSION' },
      }),
      1,
    );
    assert.deepEqual(
      await db.enrollment.findMany({
        where: { id: { in: untouched.map((r) => r.id) } },
        orderBy: { id: 'asc' },
      }),
      untouched,
    );
    assert.equal(
      (await listCourseOfferings(db, staff.id, atTurn)).changes.advanced,
      0,
    );
    assert.equal(
      (await listCourseOfferings(db, staff.id, atTurn)).offerings[0]
        .needsUpdatedList,
      true,
    );
    await reviewEnrollment(db, staff.id, active.id, {
      status: 'ACTIVE',
      periodLabel: draft.modules[1].periodLabel,
      validFrom: draft.modules[1].startsOn,
      validUntil: draft.modules[1].endsOn,
    });
    await db.enrollment.update({
      where: { id: active.id },
      data: { moduleNumber: 1 },
    });
    const corrected = await listCourseOfferings(db, staff.id, atTurn);
    assert.equal(corrected.changes.held, 1);
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: active.id } }))
        .moduleNumber,
      1,
    );
    assert.equal(
      (await listCourseOfferings(db, staff.id, atTurn)).changes.held,
      0,
    );
    await assert.rejects(
      setCourseProgression(
        db,
        staff.id,
        offeringId,
        1,
        [active.id],
        false,
        true,
        atTurn,
      ),
      (error: unknown) =>
        error instanceof CalendarError &&
        error.status === 409 &&
        /módulo.*calendário/i.test(error.message),
    );
    await assert.rejects(
      setCourseProgression(
        db,
        staff.id,
        offeringId,
        1,
        [integrated.id],
        true,
        true,
      ),
      /Confira/,
    );
    await assert.rejects(
      setCourseProgression(db, staff.id, offeringId, 1, [ended.id], true, true),
      /Confira/,
    );
    const before = await db.enrollment.findUniqueOrThrow({
      where: { id: held.id },
    });
    await assert.rejects(
      setCourseProgression(
        db,
        staff.id,
        offeringId,
        1,
        [held.id, ended.id],
        false,
        true,
        now,
      ),
    );
    assert.deepEqual(
      await db.enrollment.findUniqueOrThrow({ where: { id: held.id } }),
      before,
      'Lote inválido não aplica parcialmente.',
    );
    const nextDraft = { ...draft, label: 'Oferta fictícia corrigida' };
    await db.$executeRaw`CREATE FUNCTION ec108_reject_calendar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$`;
    try {
      await db.$executeRaw`CREATE TRIGGER ec108_reject_calendar BEFORE INSERT ON course_calendar_versions FOR EACH ROW EXECUTE FUNCTION ec108_reject_calendar()`;
      await assert.rejects(
        saveCourseCalendar(db, staff.id, offeringId, 1, nextDraft, true),
      );
      assert.equal(
        (
          await db.courseOffering.findUniqueOrThrow({
            where: { id: offeringId },
          })
        ).label,
        draft.label,
      );
      assert.equal(
        await db.courseCalendarVersion.count({ where: { offeringId } }),
        1,
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS ec108_reject_calendar ON course_calendar_versions`;
      await db.$executeRaw`DROP FUNCTION ec108_reject_calendar()`;
    }
    const revisions = await Promise.allSettled([
      saveCourseCalendar(db, staff.id, offeringId, 1, nextDraft, true),
      saveCourseCalendar(
        db,
        staff.id,
        offeringId,
        1,
        { ...draft, label: 'Outra correção fictícia' },
        true,
      ),
    ]);
    assert.equal(revisions.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.courseCalendarVersion.count({ where: { offeringId } }),
      2,
    );
    await assert.rejects(
      saveCourseCalendar(
        db,
        staff.id,
        offeringId,
        2,
        { ...draft, courseLabel: 'ADM' },
        true,
      ),
      /curso/,
    );
    const old = await db.courseCalendarVersion.findUniqueOrThrow({
      where: { offeringId_revision: { offeringId, revision: 1 } },
    });
    assert.deepEqual(old.schedule, draft);
    const calendarReviewed = await enrollment('ACTIVE', 'SUBSEQUENTE', false);
    await listCourseOfferings(db, staff.id, now);
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: calendarReviewed.id },
        })
      ).status,
      'ACTIVE',
      'Mudar somente rótulo não invalida a conferência.',
    );
    const shorterEnd = new Date(draft.modules[0].endsOn + 'T00:00:00Z');
    shorterEnd.setUTCDate(shorterEnd.getUTCDate() - 1);
    const dateCorrection = {
      ...draft,
      modules: draft.modules.map((m, i) =>
        i === 0 ? { ...m, endsOn: shorterEnd.toISOString().slice(0, 10) } : m,
      ),
    };
    await saveCourseCalendar(db, staff.id, offeringId, 2, dateCorrection, true);
    await listCourseOfferings(db, staff.id, now);
    const revisedDates = await db.enrollment.findUniqueOrThrow({
      where: { id: calendarReviewed.id },
    });
    assert.equal(
      revisedDates.status,
      'UNCONFIRMED',
      'Correção das datas oficiais exige nova conferência mesmo sem trocar módulo.',
    );
    assert.equal(
      revisedDates.validUntil?.toISOString().slice(0, 10),
      dateCorrection.modules[0].endsOn,
    );
    assert.equal(
      (await listCourseOfferings(db, staff.id, now)).changes.advanced,
      0,
    );
    for (const courseLabel of ['ADM', 'ENF'] as const) {
      const id = randomUUID();
      offerIds.push(id);
      const cal = make(courseLabel);
      await saveCourseCalendar(db, staff.id, id, 0, cal, true);
      const last = cal.modules.at(-1)!;
      const row = await db.enrollment.create({
        data: {
          studentId: student.studentId,
          mode: 'SUBSEQUENTE',
          courseLabel,
          className: 'Turma sem letra fictícia',
          moduleNumber: 1,
          status: 'ACTIVE',
          periodLabel: cal.modules[0].periodLabel,
          validFrom: new Date(cal.modules[0].startsOn),
          validUntil: new Date(cal.modules[0].endsOn),
          reviewedAt: now,
          reviewedById: staff.id,
          offeringId: id,
          calendarModule: 1,
          calendarRevision: 1,
          progressionHeld: false,
        },
      });
      await listCourseOfferings(
        db,
        staff.id,
        new Date(last.startsOn + 'T03:00:00Z'),
      );
      assert.equal(
        (await db.enrollment.findUniqueOrThrow({ where: { id: row.id } }))
          .moduleNumber,
        courseLabel === 'ENF' ? 4 : 3,
      );
    }
    const importCourse = offerIds.at(-1)!,
      importDraft = make('ENF');
    const sheet = sheetFixture('SUBSEQUENTE');
    const registration = String(randomInt(10000000, 99999999));
    assert.equal(
      await db.student.findUnique({
        where: { schoolRegistration: registration },
      }),
      null,
    );
    importedRegistrations.push(registration);
    sheet.wb.Sheets['Fictícia'].A7 = { t: 's', v: registration };
    const context = {
      ...sheet.context,
      scopeId: importCourse,
      periodLabel: importDraft.modules[0].periodLabel,
    };
    const payload = () => ({
      mode: 'SUBSEQUENTE',
      contexts: [context],
      fileBase64: sheet.file().toString('base64'),
    });
    const importPost = (body: unknown) =>
      fetch(base + '/api/secretaria/importacao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      });
    const previewResponse = await importPost({
      action: 'preview',
      ...payload(),
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.calendarComparisons[0].expectedModule, 1);
    assert.equal(preview.calendarComparisons[0].differs, false);
    assert.equal(
      await db.student.findUnique({
        where: { schoolRegistration: registration },
      }),
      null,
      'Prévia não cadastra nem promove alunos.',
    );
    const applied = await importPost({
      action: 'confirm',
      ...payload(),
      token: preview.token,
      confirmed: true,
    });
    assert.equal(applied.status, 200);
    const imported = await db.student.findUniqueOrThrow({
      where: { schoolRegistration: registration },
      include: { enrollments: true },
    });
    const importedEnrollment = imported.enrollments[0];
    assert.equal(importedEnrollment.offeringId, importCourse);
    assert.equal(importedEnrollment.progressionHeld, true);
    assert.equal(
      (await listCourseOfferings(db, staff.id, now)).offerings.find(
        (o) => o.id === importCourse,
      )!.needsUpdatedList,
      false,
    );
    const integratedCopy = await db.enrollment.create({
      data: {
        studentId: imported.id,
        mode: 'INTEGRADO',
        className: 'Integrado fictício preservado',
        courseLabel: 'ADM',
        grade: 1,
      },
    });
    sheet.wb.Sheets['Fictícia'].A4 = { t: 's', v: '2MODULO - TURMA-FICTICIA' };
    context.stage = 2;
    context.periodLabel = importDraft.modules[1].periodLabel;
    const correctionResponse = await importPost({
      action: 'preview',
      ...payload(),
    });
    assert.equal(correctionResponse.status, 200);
    const correction = await correctionResponse.json();
    assert.equal(correction.calendarComparisons[0].differs, true);
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: importedEnrollment.id },
        })
      ).moduleNumber,
      1,
    );
    assert.equal(
      (
        await importPost({
          action: 'confirm',
          ...payload(),
          token: correction.token,
          confirmed: true,
        })
      ).status,
      409,
      'Divergência precisa de confirmação explícita.',
    );
    assert.equal(
      (
        await importPost({
          action: 'confirm',
          ...payload(),
          token: correction.token,
          confirmed: true,
          acceptCalendarDifferences: true,
        })
      ).status,
      200,
    );
    const preserved = await db.enrollment.findUniqueOrThrow({
      where: { id: importedEnrollment.id },
    });
    assert.equal(preserved.moduleNumber, 2);
    assert.equal(preserved.progressionHeld, true);
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: integratedCopy.id },
        })
      ).grade,
      1,
    );
    assert.equal(
      (await listCourseOfferings(db, staff.id, now)).offerings.find(
        (o) => o.id === importCourse,
      )!.needsUpdatedList,
      true,
    );
    await db.enrollment.update({
      where: { id: importedEnrollment.id },
      data: { progressionHeld: false },
    });
    const repeatedCorrectionResponse = await importPost({
      action: 'preview',
      ...payload(),
    });
    const repeatedCorrection = await repeatedCorrectionResponse.json();
    assert.equal(
      (
        await importPost({
          action: 'confirm',
          ...payload(),
          token: repeatedCorrection.token,
          confirmed: true,
          acceptCalendarDifferences: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: importedEnrollment.id },
        })
      ).progressionHeld,
      true,
      'Planilha divergente preserva a exceção mesmo sem alteração dos campos escolares.',
    );
    const staleResponse = await importPost({ action: 'preview', ...payload() });
    assert.equal(staleResponse.status, 200);
    const stale = await staleResponse.json();
    await saveCourseCalendar(
      db,
      staff.id,
      importCourse,
      1,
      { ...importDraft, label: 'Revisão sintética da oferta' },
      true,
    );
    assert.equal(
      (
        await importPost({
          action: 'confirm',
          ...payload(),
          token: stale.token,
          confirmed: true,
          acceptCalendarDifferences: true,
        })
      ).status,
      409,
      'Calendário alterado invalida prévia antiga.',
    );
    const nextRegistration = String(randomInt(10000000, 99999999));
    assert.equal(
      await db.student.findUnique({
        where: { schoolRegistration: nextRegistration },
      }),
      null,
    );
    importedRegistrations.push(nextRegistration);
    sheet.wb.Sheets['Fictícia'].A7 = { t: 's', v: nextRegistration };
    sheet.wb.Sheets['Fictícia'].A4 = { t: 's', v: '1MODULO - TURMA-FICTICIA' };
    context.stage = 1;
    context.periodLabel = importDraft.modules[0].periodLabel;
    const newListResponse = await importPost({
      action: 'preview',
      ...payload(),
    });
    assert.equal(newListResponse.status, 200);
    const newList = await newListResponse.json();
    assert.equal(newList.counts.absent, 1);
    assert.equal(newList.counts.createdStudents, 1);
    assert.equal(
      (
        await importPost({
          action: 'confirm',
          ...payload(),
          token: newList.token,
          confirmed: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: importedEnrollment.id },
        })
      ).moduleNumber,
      2,
      'Ausente conserva módulo/exceção/histórico.',
    );
    assert.equal(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: integratedCopy.id },
        })
      ).grade,
      1,
    );
    assert.equal((await post({ action: 'list' }, cookie)).status, 410);
    const publicText = JSON.stringify(await listCourseOfferings(db, staff.id));
    for (const privateValue of [staff.email!, password, student.email!])
      assert.ok(!publicText.includes(privateValue));
    console.log(
      'OK: ofertas/versionamento, fuso/virada, concorrência, idempotência, exceções, encerrados/integrado preservados, aviso de lista, limite3/4, autorização e rollback.',
    );
  } finally {
    try {
      if (students.length || importedRegistrations.length)
        await db.student.deleteMany({
          where: {
            OR: [
              { id: { in: students } },
              { schoolRegistration: { in: importedRegistrations } },
            ],
          },
        });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offerIds } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offerIds } } });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
