import assert from 'node:assert/strict';
import { schoolClassSchedule } from '../src/lib/school-class-input';
import { schoolHeaderFixture } from './test-sheet-input';
import {
  inspectSchoolSheet,
  parseSheetInput,
} from '../src/lib/sheet-import-input';
import {
  previewSheetImport,
  confirmSheetImport,
} from '../src/lib/sheet-import';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { completeSchoolEnrollments } from '../src/lib/school-completion';
import { academicVersion } from '../src/lib/school-academic-administration';
import { manageAcademicEnrollment } from '../src/lib/school-academic-administration';
import { readAcademicAdminInput } from '../src/lib/school-academic-input';
import { requireCurrentEnrollment } from '../src/lib/enrollment-validity';
async function main() {
  const old = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment(),
    db = env.db;
  const now = new Date('2026-11-16T15:00:00Z');
  try {
    assert.equal(await db.student.count(), 0);
    async function person(role: 'secretary' | 'student') {
      return db.student.create({
        data: {
          fullName: 'Pessoa fictícia ' + role,
          birthDate: new Date('2000-01-01'),
          schoolRegistration: randomUUID(),
          account: {
            create: {
              role,
              status: 'active',
              email: randomUUID() + '@example.invalid',
              passwordHash: 'ficticio',
            },
          },
        },
        include: { account: true },
      });
    }
    const staff = await person('secretary'),
      pupil = await person('student'),
      other = await person('student');
    const context = {
      mode: 'INTEGRADO',
      courseLabel: 'DS',
      className: '3A DS',
      periodLabel: '2026',
    };
    const data = {
      mode: 'INTEGRADO' as const,
      courseLabel: 'DS',
      className: context.className,
      periodLabel: context.periodLabel,
      grade: 3,
      schoolYear: 2026,
      status: 'ACTIVE' as const,
      validFrom: new Date('2026-02-01'),
      validUntil: new Date('2026-12-31'),
      reviewedAt: now,
      reviewedById: staff.account!.id,
      progressionHeld: false,
    };
    const a = await db.enrollment.create({
        data: { ...data, studentId: pupil.id },
      }),
      b = await db.enrollment.create({
        data: { ...data, studentId: other.id },
      });
    const independent = await db.enrollment.create({
      data: {
        ...data,
        studentId: pupil.id,
        courseLabel: 'ADM',
        className: '3A ADM',
      },
    });
    const choices = [a, b].map((e) => ({
      enrollmentId: e.id,
      version: academicVersion(e),
    }));
    const input = {
      operation: 'preview',
      context,
      selections: choices,
      reason: 'Conclusão escolar fictícia conferida.',
    };
    await assert.rejects(
      completeSchoolEnrollments(db, pupil.account!.id, input, now),
      /Somente a secretaria/,
    );
    const preview = await completeSchoolEnrollments(
      db,
      staff.account!.id,
      input,
      now,
    );
    assert.ok('previewVersion' in preview);
    assert.ok('students' in preview && preview.students.length === 2);
    assert.equal(await db.schoolAcademicEvent.count(), 0);
    const confirm = {
      ...input,
      operation: 'confirm',
      confirmed: true,
      requestKey: randomUUID(),
      previewVersion: preview.previewVersion,
    };
    await assert.rejects(
      completeSchoolEnrollments(
        db,
        staff.account!.id,
        { ...confirm, previewVersion: 'a'.repeat(64) },
        now,
      ),
      /mudou|prévia/,
    );
    const result = await completeSchoolEnrollments(
      db,
      staff.account!.id,
      confirm,
      now,
    );
    assert.deepEqual(result, { ended: 2, replayed: false });
    assert.deepEqual(
      await completeSchoolEnrollments(db, staff.account!.id, confirm, now),
      { ended: 2, replayed: true },
    );
    await assert.rejects(
      completeSchoolEnrollments(
        db,
        staff.account!.id,
        { ...confirm, selections: [choices[0]] },
        now,
      ),
      /tentativa|operação/,
    );
    for (const e of [a, b]) {
      const ended = await db.enrollment.findUniqueOrThrow({
        where: { id: e.id },
      });
      assert.equal(ended.status, 'ENDED');
      assert.throws(() => requireCurrentEnrollment(ended, undefined, now));
    }
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: independent.id } }))
        .status,
      'ACTIVE',
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: pupil.account!.id } }))
        .status,
      'active',
    );
    assert.equal(
      await db.schoolAcademicEvent.count({ where: { kind: 'END' } }),
      2,
    );
    const beforeReopen = await db.enrollment.findUniqueOrThrow({
      where: { id: a.id },
    });
    const reopen = readAcademicAdminInput({
      operation: 'change',
      enrollmentId: a.id,
      action: 'REOPEN',
      version: academicVersion(beforeReopen),
      requestKey: randomUUID(),
      reason: 'Encerramento fictício corrigido.',
      confirmed: true,
    });
    const correction = await db.$transaction((tx) =>
      manageAcademicEnrollment(tx, staff.account!.id, reopen, now),
    );
    assert.equal(correction.enrollment.status, 'UNCONFIRMED');
    assert.equal(correction.enrollment.progressionHeld, true);
    const second = await db.$transaction((tx) =>
      manageAcademicEnrollment(tx, staff.account!.id, reopen, now),
    );
    assert.equal(second.created, false);
    assert.equal(
      await db.schoolAcademicEvent.count({ where: { enrollmentId: a.id } }),
      2,
    );
    const correctionEvent = await db.schoolAcademicEvent.findFirstOrThrow({
      where: { enrollmentId: a.id, kind: 'REOPEN' },
    });
    assert.ok(
      (correctionEvent.afterState as Record<string, unknown>).correctsEventId,
    );
    console.log(
      'OK: correção acrescenta evento e exige reconferência sem liberar emissão automaticamente.',
    );

    async function finalRow(
      mode: 'INTEGRADO' | 'SUBSEQUENTE' = 'INTEGRADO',
      course: 'DS' | 'ADM' | 'ENF' = 'DS',
      label?: string,
    ) {
      const stage = mode === 'SUBSEQUENTE' && course === 'ENF' ? 4 : 3;
      const name =
        label ??
        (mode === 'INTEGRADO'
          ? '3A DS'
          : 'ST' +
            (course === 'ENF' ? 'ENFN' : course === 'ADM' ? 'ADMN' : 'DSIN') +
            stage +
            'U');
      const st = await person('student');
      const schedule = schoolClassSchedule(course, stage, '2026.2', name);
      const ref =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: schedule.label,
                courseLabel: course,
                calendars: {
                  create: {
                    revision: 1,
                    schedule,
                    createdById: staff.account!.id,
                  },
                },
              },
            })
          : null;
      return db.enrollment.create({
        data: {
          ...data,
          studentId: st.id,
          mode,
          courseLabel: course,
          className: name,
          periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
          grade: mode === 'INTEGRADO' ? 3 : null,
          moduleNumber: mode === 'SUBSEQUENTE' ? stage : null,
          validFrom: new Date(
            mode === 'INTEGRADO'
              ? '2026-02-01'
              : schedule.modules[stage - 1].startsOn,
          ),
          ...(ref
            ? { offeringId: ref.id, calendarModule: stage, calendarRevision: 1 }
            : {}),
        },
      });
    }
    function inputFor(rows: (typeof a)[]) {
      return {
        operation: 'preview',
        context: {
          mode: rows[0].mode,
          courseLabel: rows[0].courseLabel,
          className: rows[0].className,
          periodLabel: rows[0].periodLabel,
        },
        selections: rows.map((r) => ({
          enrollmentId: r.id,
          version: academicVersion(r),
        })),
        reason: 'Conclusão fictícia conferida.',
      };
    }
    async function confirmation(rows: (typeof a)[]) {
      const input = inputFor(rows),
        view = await completeSchoolEnrollments(
          db,
          staff.account!.id,
          input,
          now,
        );
      assert.ok('previewVersion' in view);
      return {
        ...input,
        operation: 'confirm',
        confirmed: true,
        previewVersion: view.previewVersion,
        requestKey: randomUUID(),
      };
    }
    const invalid = await finalRow();
    for (const patch of [
      { grade: 2 },
      { repetitionPending: true },
      { status: 'UNCONFIRMED' as const },
      { status: 'UNCONFIRMED' as const, reviewedAt: null },
      { validFrom: new Date('2027-02-01'), validUntil: new Date('2027-12-31') },
    ]) {
      const changed = await db.enrollment.update({
        where: { id: invalid.id },
        data: patch,
      });
      await assert.rejects(
        completeSchoolEnrollments(
          db,
          staff.account!.id,
          inputFor([changed]),
          now,
        ),
        /mudou/,
      );
      await db.enrollment.update({
        where: { id: invalid.id },
        data: {
          grade: 3,
          repetitionPending: false,
          status: 'ACTIVE',
          reviewedAt: now,
          validFrom: invalid.validFrom,
          validUntil: invalid.validUntil,
        },
      });
    }
    const target = await finalRow(),
      oldConfirm = await confirmation([target]);
    await db.student.update({
      where: { id: target.studentId },
      data: { fullName: 'Nome fictício corrigido' },
    });
    await assert.rejects(
      completeSchoolEnrollments(db, staff.account!.id, oldConfirm, now),
      /prévia/,
    );
    const fresh = await confirmation([target]);
    await db.account.update({
      where: { id: staff.account!.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      completeSchoolEnrollments(db, staff.account!.id, fresh, now),
      /Somente a secretaria/,
    );
    await db.account.update({
      where: { id: staff.account!.id },
      data: { role: 'secretary' },
    });
    await db.student.update({
      where: { id: target.studentId },
      data: { loginBlocked: true, issuanceBlocked: true },
    });
    await completeSchoolEnrollments(db, staff.account!.id, fresh, now);
    const unchangedFlags = await db.student.findUniqueOrThrow({
      where: { id: target.studentId },
    });
    assert.equal(unchangedFlags.loginBlocked, true);
    assert.equal(unchangedFlags.issuanceBlocked, true);
    const closed = await db.enrollment.findUniqueOrThrow({
      where: { id: target.id },
    });
    await db.enrollment.update({
      where: { id: target.id },
      data: { className: 'Dado fictício divergente' },
    });
    const inconsistent = await db.enrollment.findUniqueOrThrow({
      where: { id: target.id },
    });
    await assert.rejects(
      db.$transaction((tx) =>
        manageAcademicEnrollment(
          tx,
          staff.account!.id,
          readAcademicAdminInput({
            operation: 'change',
            enrollmentId: target.id,
            action: 'REOPEN',
            version: academicVersion(inconsistent),
            requestKey: randomUUID(),
            reason: 'Correção fictícia conferida.',
            confirmed: true,
          }),
          now,
        ),
      ),
      /compatível/,
    );
    await db.enrollment.update({
      where: { id: target.id },
      data: { className: closed.className },
    });
    for (const course of ['ADM', 'ENF'] as const) {
      const row = await finalRow('SUBSEQUENTE', course),
        payload = await confirmation([row]);
      await completeSchoolEnrollments(db, staff.account!.id, payload, now);
      assert.equal(
        (await db.enrollment.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
        'ENDED',
      );
    }
    const changedReference = await finalRow('SUBSEQUENTE', 'DS'),
      refPreview = await confirmation([changedReference]);
    const firstReference = await db.courseCalendarVersion.findFirstOrThrow({
      where: { offeringId: changedReference.offeringId! },
    });
    await db.courseCalendarVersion.create({
      data: {
        offeringId: changedReference.offeringId!,
        revision: 2,
        schedule: JSON.parse(JSON.stringify(firstReference.schedule)),
        createdById: staff.account!.id,
      },
    });
    await assert.rejects(
      completeSchoolEnrollments(db, staff.account!.id, refPreview, now),
      /mudou/,
    );
    console.log(
      'OK: última etapa, vigência inicial, revisão, repetência, referência, identidade e papel revalidados; bloqueios manuais preservados.',
    );
    const batch = [
      await finalRow('INTEGRADO', 'DS', '3A rollback'),
      await finalRow('INTEGRADO', 'DS', '3A rollback'),
    ].sort((x, y) => x.id.localeCompare(y.id));
    const failure = await confirmation(batch);
    await db.$executeRaw`CREATE FUNCTION test_completion_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='END' AND NEW.enrollment_id=(SELECT id FROM enrollments WHERE class_name='3A rollback' ORDER BY id DESC LIMIT 1) THEN RAISE EXCEPTION 'Falha sintética após primeira escrita'; END IF; RETURN NEW; END; $$`;
    await db.$executeRaw`CREATE TRIGGER test_completion_failure BEFORE INSERT ON school_academic_events FOR EACH ROW EXECUTE FUNCTION test_completion_failure()`;
    try {
      await assert.rejects(
        completeSchoolEnrollments(db, staff.account!.id, failure, now),
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER test_completion_failure ON school_academic_events`;
      await db.$executeRaw`DROP FUNCTION test_completion_failure()`;
    }
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: { enrollmentId: { in: batch.map((r) => r.id) } },
      }),
      0,
    );
    for (const r of batch)
      assert.equal(
        (await db.enrollment.findUniqueOrThrow({ where: { id: r.id } })).status,
        'ACTIVE',
      );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: batch[0].id } }))
        .academicRevision,
      0,
    );
    const concurrent = [
      await finalRow('INTEGRADO', 'DS', '3B concorrência'),
      await finalRow('INTEGRADO', 'DS', '3B concorrência'),
    ];
    const same = await confirmation(concurrent);
    const outcomes = await Promise.allSettled([
      completeSchoolEnrollments(db, staff.account!.id, same, now),
      completeSchoolEnrollments(db, staff.account!.id, same, now),
    ]);
    assert.ok(outcomes.some((r) => r.status === 'fulfilled'));
    assert.deepEqual(
      await completeSchoolEnrollments(db, staff.account!.id, same, now),
      { ended: 2, replayed: true },
    );
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: {
          enrollmentId: { in: concurrent.map((r) => r.id) },
          kind: 'END',
        },
      }),
      2,
    );
    const freshRow = await finalRow();
    await assert.rejects(
      completeSchoolEnrollments(
        db,
        staff.account!.id,
        { ...same, ...inputFor([freshRow]), operation: 'confirm' },
        now,
      ),
      /tentativa/,
    );
    console.log(
      'OK: erro após primeira escrita desfaz lote/eventos; confirmações simultâneas e repetidas não duplicam encerramento.',
    );
    const f = schoolHeaderFixture('INTEGRADO', 'DS', 3, '2026', 'TDS3IN-A'),
      header = (await inspectSchoolSheet(f.file(), 'INTEGRADO', true))[0];
    const imported = await parseSheetInput(
      f.file(),
      'INTEGRADO',
      [
        {
          sheetName: header.sheetName,
          scopeId: header.scopeId!,
          className: header.classCode!,
          periodLabel: header.periodLabel!,
          courseLabel: header.courseLabel,
          stage: header.stage,
          sourceChoice: 'header',
          confirmed: true,
          bindings: {},
        },
      ],
      true,
    );
    const initialImport = await previewSheetImport(
      db,
      staff.account!.id,
      imported,
    );
    await confirmSheetImport(
      db,
      staff.account!.id,
      imported,
      initialImport.token,
      true,
      true,
      true,
    );
    const fromFile = await db.enrollment.findUniqueOrThrow({
      where: { schoolImportKey: imported.rows[0].key },
    });
    assert.equal(fromFile.status, 'UNCONFIRMED');
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: { enrollmentId: fromFile.id },
      }),
      0,
    );
    const reviewed = await db.enrollment.update({
      where: { id: fromFile.id },
      data: {
        status: 'ACTIVE',
        reviewedAt: now,
        reviewedById: staff.account!.id,
      },
    });
    await completeSchoolEnrollments(
      db,
      staff.account!.id,
      await confirmation([reviewed]),
      now,
    );
    const again = await previewSheetImport(db, staff.account!.id, imported);
    await confirmSheetImport(
      db,
      staff.account!.id,
      imported,
      again.token,
      true,
      true,
      true,
    );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: fromFile.id } }))
        .status,
      'ENDED',
    );
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: { enrollmentId: fromFile.id, kind: 'END' },
      }),
      1,
    );
    for (let i = 0; i < 21; i++) await finalRow('INTEGRADO', 'DS', '3C lista');
    const scope = { ...context, className: '3C lista' },
      p1 = await completeSchoolEnrollments(
        db,
        staff.account!.id,
        { operation: 'candidates', context: scope, page: 1 },
        now,
      ),
      p2 = await completeSchoolEnrollments(
        db,
        staff.account!.id,
        { operation: 'candidates', context: scope, page: 2 },
        now,
      );
    assert.ok('page' in p1 && 'page' in p2);
    assert.equal(p1.students.length, 20);
    assert.equal(p1.hasNext, true);
    assert.equal(p2.students.length, 1);
    assert.equal(p2.hasNext, false);
    assert.ok(
      !p1.students.some((r) => r.enrollmentId === p2.students[0].enrollmentId),
    );
    console.log(
      'OK: importação da última etapa não conclui automaticamente; reimportação mantém encerramento e lista é paginada20+1.',
    );

    console.log(
      'OK: prévia sem encerramento, lote explícito/idempotente, outro vínculo e conta preservados; nova declaração recusada.',
    );
  } finally {
    if (old === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = old;
    await env.close();
  }
}
main().catch(reportTestFailure);
