import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { schoolHeaderFixture } from './test-sheet-input';
import {
  parseSheetInput,
  inspectSchoolSheet,
} from '../src/lib/sheet-import-input';
import { withRepeaterSelections } from '../src/lib/school-repeater-input';
import {
  previewSheetImport,
  confirmSheetImport,
} from '../src/lib/sheet-import';
import { recordAcademicChange } from '../src/lib/school-academic';
import { academicVersion } from '../src/lib/school-academic-administration';
import { schoolClassSchedule } from '../src/lib/school-class-input';
import { subsequentContext, declarationStudent } from '../src/lib/declarations';
import { requireCurrentEnrollment } from '../src/lib/enrollment-validity';
async function main() {
  const env = await openTestEnvironment();
  const { db } = env;
  const oldFlag = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  try {
    assert.equal(await db.student.count(), 0);
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia enturmação',
        birthDate: new Date('2000-01-01'),
        account: {
          create: {
            email: 'enturmacao@example.invalid',
            role: 'secretary',
            status: 'active',
            passwordHash: 'fictício',
          },
        },
      },
      include: { account: true },
    });
    const actor = staff.account!.id;
    const offering = await db.courseOffering.create({
      data: {
        label: 'Origem fictícia',
        courseLabel: 'DS',
        calendars: {
          create: {
            revision: 1,
            schedule: schoolClassSchedule('DS', 1, '2026.2', 'STDSIN1A'),
            createdById: actor,
          },
        },
      },
    });
    const pupil = await db.student.create({
      data: {
        schoolRegistration: '777771',
        fullName: 'Repetente fictício',
        birthDate: new Date('2000-01-01'),
        loginBlocked: true,
        issuanceBlocked: true,
        account: {
          create: {
            email: 'repetente@example.invalid',
            role: 'student',
            status: 'active',
            passwordHash: 'fictício',
          },
        },
        enrollments: {
          create: {
            mode: 'SUBSEQUENTE',
            courseLabel: 'DS',
            className: 'STDSIN1A',
            moduleNumber: 1,
            periodLabel: '2026.2',
            schoolYear: 2026,
            status: 'ACTIVE',
            reviewedAt: new Date(),
            reviewedById: actor,
            progressionHeld: false,
            validFrom: new Date('2026-08-01'),
            validUntil: new Date('2026-12-31'),
            offeringId: offering.id,
            calendarRevision: 1,
            calendarModule: 1,
          },
        },
      },
      include: { enrollments: true, account: true },
    });
    await db.$transaction((tx) =>
      recordAcademicChange(
        tx,
        pupil.enrollments[0],
        { repetitionPending: true, progressionHeld: true },
        {
          actorId: actor,
          kind: 'REPEAT',
          reason: 'Reprovação fictícia confirmada.',
          operationKey: randomUUID(),
          effectiveOn: '2026-11-16',
        },
      ),
    );
    const original = await db.enrollment.findUniqueOrThrow({
      where: { id: pupil.enrollments[0].id },
    });
    const fixture = schoolHeaderFixture(
      'SUBSEQUENTE',
      'DS',
      1,
      '2027.1',
      'STDSIN1B',
    );
    const heads = await inspectSchoolSheet(fixture.file(), 'SUBSEQUENTE', true);
    const contexts = heads.map((h) => ({
      sheetName: h.sheetName,
      scopeId: h.scopeId!,
      className: h.classCode!,
      periodLabel: h.periodLabel!,
      courseLabel: h.courseLabel,
      stage: h.stage,
      sourceChoice: 'header',
      confirmed: true,
      bindings: {},
    }));
    const base = await parseSheetInput(
      fixture.file(),
      'SUBSEQUENTE',
      contexts,
      true,
    );
    const input = withRepeaterSelections(base, [
      {
        enrollmentId: original.id,
        sheetName: contexts[0].sheetName,
        version: academicVersion(original),
      },
    ]);
    const preview = await previewSheetImport(db, actor, input);
    assert.ok(
      Array.isArray(preview.placements),
      'A prévia precisa conferir a seleção de repetentes.',
    );
    assert.equal(
      preview.placements.length,
      1,
      'Repetente ausente do XLS precisa aparecer separadamente na prévia.',
    );
    assert.equal(preview.placements[0].inFile, false);
    assert.equal(preview.counts.createdStudents, 1);
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: original.id } }))
        .repetitionPending,
      true,
      'Prévia não transfere.',
    );
    await assert.rejects(
      confirmSheetImport(db, actor, input, preview.token, true, false, false),
      /Confirme a enturmação/,
    );
    const result = await confirmSheetImport(
      db,
      actor,
      input,
      preview.token,
      true,
      false,
      false,
      true,
    );
    assert.ok(result && typeof result === 'object' && !Array.isArray(result));
    assert.equal('placedRepeaters' in result && result.placedRepeaters, 1);
    assert.deepEqual(
      await confirmSheetImport(
        db,
        actor,
        input,
        preview.token,
        true,
        false,
        false,
        true,
      ),
      result,
      'Replay não duplica enturmação.',
    );
    const placed = await db.enrollment.findUniqueOrThrow({
      where: { id: original.id },
    });
    assert.equal(placed.className, 'STDSIN1B');
    assert.equal(placed.moduleNumber, 1);
    assert.equal(placed.periodLabel, '2027.1');
    assert.equal(placed.repetitionPending, false);
    assert.equal(placed.progressionHeld, false);
    assert.equal(
      placed.entryStartedOn!.toISOString().slice(0, 10),
      '2026-08-01',
    );
    assert.equal(
      await db.enrollment.count({ where: { studentId: pupil.id } }),
      1,
    );
    assert.equal(
      (await db.student.findUniqueOrThrow({ where: { id: pupil.id } }))
        .loginBlocked,
      true,
    );
    assert.equal(
      (await db.student.findUniqueOrThrow({ where: { id: pupil.id } }))
        .issuanceBlocked,
      true,
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: pupil.account!.id } }))
        .studentId,
      pupil.id,
    );
    assert.throws(() =>
      requireCurrentEnrollment(
        placed,
        undefined,
        new Date('2027-02-01T02:59:59Z'),
      ),
    );
    requireCurrentEnrollment(
      placed,
      undefined,
      new Date('2027-02-01T03:00:00Z'),
    );
    const student = (await declarationStudent(db, pupil.id))!;
    const rendered = subsequentContext(
      student.enrollments[0],
      new Date('2027-02-01T12:00:00Z'),
    );
    assert.equal(rendered.startsOn, '2026-08-01');
    assert.equal(rendered.endsOn, '2028-07-31');
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: { enrollmentId: original.id, kind: 'TRANSFER' },
      }),
      1,
    );
    console.log(
      'OK: prévia/confirmar/replay, repetente fora do XLS, conta/ingresso/bloqueios preservados e início exato Recife.',
    );
  } finally {
    if (oldFlag === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = oldFlag;
    await env.close();
  }
}
main().catch(reportTestFailure);
