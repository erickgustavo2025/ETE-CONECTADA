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
import {
  academicVersion,
  manageAcademicEnrollment,
} from '../src/lib/school-academic-administration';
import { schoolClassSchedule } from '../src/lib/school-class-input';
import { subsequentContext, declarationStudent } from '../src/lib/declarations';
import { readAcademicAdminInput } from '../src/lib/school-academic-input';
import { suggestRepeaterPlacements } from '../src/lib/sheet-import';
import { requireAcademicRequestAccess } from '../src/lib/school-academic';
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
    let original = await db.enrollment.findUniqueOrThrow({
      where: { id: pupil.enrollments[0].id },
    });
    const detail = {
      operation: 'detail' as const,
      enrollmentId: original.id,
      page: 1,
    };
    let school = await db.$transaction((tx) =>
      manageAcademicEnrollment(
        tx,
        actor,
        detail,
        new Date('2026-11-16T12:00:00Z'),
      ),
    );
    const action = (name: string) =>
      readAcademicAdminInput({
        operation: 'change',
        action: name,
        enrollmentId: original.id,
        version: school.enrollment.version,
        requestKey: randomUUID(),
        reason: 'Exceção fictícia conferida.',
        confirmed: true,
      });
    const allow = action('ALLOW_REQUESTS');
    school = await db.$transaction((tx) =>
      manageAcademicEnrollment(
        tx,
        actor,
        allow,
        new Date('2026-11-16T12:00:00Z'),
      ),
    );
    assert.equal(school.enrollment.repetitionOverride, true);
    assert.equal(school.enrollment.repetitionPending, true);
    await db.$transaction((tx) => requireAcademicRequestAccess(tx, pupil.id));
    assert.equal(
      (
        await db.$transaction((tx) =>
          manageAcademicEnrollment(
            tx,
            actor,
            allow,
            new Date('2026-11-16T12:00:00Z'),
          ),
        )
      ).created,
      false,
    );
    school = await db.$transaction((tx) =>
      manageAcademicEnrollment(
        tx,
        actor,
        action('WAIT_REQUESTS'),
        new Date('2026-11-16T12:00:00Z'),
      ),
    );
    await assert.rejects(
      db.$transaction((tx) => requireAcademicRequestAccess(tx, pupil.id)),
      /aguardando/,
    );
    await assert.rejects(
      db.$transaction((tx) =>
        manageAcademicEnrollment(
          tx,
          actor,
          action('ALLOW_REQUESTS'),
          new Date('2027-02-01T12:00:00Z'),
        ),
      ),
      /conferida e vigente/,
    );
    assert.equal(
      await db.schoolAcademicEvent.count({
        where: { enrollmentId: original.id, kind: 'OVERRIDE' },
      }),
      2,
    );
    original = await db.enrollment.findUniqueOrThrow({
      where: { id: original.id },
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
    const candidates = await suggestRepeaterPlacements(
      db,
      actor,
      base,
      contexts[0].sheetName,
      1,
    );
    assert.equal(candidates.candidates.length, 1);
    assert.equal(candidates.candidates[0].enrollmentId, original.id);
    await assert.rejects(
      suggestRepeaterPlacements(
        db,
        pupil.account!.id,
        base,
        contexts[0].sheetName,
        1,
      ),
      /autorizado/,
    );
    await assert.rejects(
      previewSheetImport(
        db,
        actor,
        withRepeaterSelections(base, [
          {
            enrollmentId: original.id,
            sheetName: contexts[0].sheetName,
            version: '0'.repeat(64),
          },
        ]),
      ),
      /mudou/,
    );
    await assert.rejects(
      previewSheetImport(db, actor, {
        ...input,
        contexts: input.contexts.map((c) => ({ ...c, stage: 2 })),
      }),
      /mudou/,
    );
    await assert.rejects(
      previewSheetImport(db, actor, { ...input, mode: 'INTEGRADO' }),
      /mudou/,
    );
    let preview = await previewSheetImport(db, actor, input);
    await db.account.update({
      where: { id: pupil.account!.id },
      data: { role: 'secretary' },
    });
    await assert.rejects(
      confirmSheetImport(
        db,
        actor,
        input,
        preview.token,
        true,
        false,
        false,
        true,
      ),
      /mudou/,
    );
    await db.account.update({
      where: { id: pupil.account!.id },
      data: { role: 'student' },
    });
    preview = await previewSheetImport(db, actor, input);
    await db.courseOffering.create({
      data: {
        id: contexts[0].scopeId,
        label: 'Destino conferido por outra pessoa',
        courseLabel: 'DS',
        calendars: {
          create: {
            revision: 2,
            schedule: schoolClassSchedule('DS', 1, '2027.1', 'STDSIN1B'),
            createdById: actor,
          },
        },
      },
    });
    await assert.rejects(
      confirmSheetImport(
        db,
        actor,
        input,
        preview.token,
        true,
        false,
        false,
        true,
      ),
      /mudaram/,
    );
    preview = await previewSheetImport(db, actor, input);
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
    assert.equal(placed.calendarRevision, 2);
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
    let sequence = 880001;
    async function destination(
      mode: 'INTEGRADO' | 'SUBSEQUENTE',
      course: 'ADM' | 'DS' | 'ENF',
      stage: number,
      code: string,
    ) {
      const f = schoolHeaderFixture(
        mode,
        course,
        stage,
        mode === 'INTEGRADO' ? '2027' : '2027.1',
        code,
      );
      f.wb.Sheets['Fictícia'].A7 = { t: 's', v: String(sequence++) };
      const h = (await inspectSchoolSheet(f.file(), mode, true))[0];
      return parseSheetInput(
        f.file(),
        mode,
        [
          {
            sheetName: h.sheetName,
            scopeId: h.scopeId!,
            className: h.classCode!,
            periodLabel: h.periodLabel!,
            courseLabel: h.courseLabel,
            stage: h.stage,
            sourceChoice: 'header',
            confirmed: true,
            bindings: {},
          },
        ],
        true,
      );
    }
    async function waiting(
      mode: 'INTEGRADO' | 'SUBSEQUENTE',
      course: 'ADM' | 'DS' | 'ENF',
      stage: number,
      held = false,
    ) {
      const st = await db.student.create({
        data: {
          schoolRegistration: String(sequence++),
          fullName: 'Repetente fictício ' + sequence,
          birthDate: new Date('2000-01-01'),
        },
      });
      const ref =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: 'Origem ' + sequence,
                courseLabel: course,
                calendars: {
                  create: {
                    revision: 1,
                    schedule: schoolClassSchedule(
                      course,
                      stage,
                      '2026.2',
                      `ST${course}N${stage}U`,
                    ),
                    createdById: actor,
                  },
                },
              },
            })
          : null;
      let e = await db.enrollment.create({
        data: {
          studentId: st.id,
          mode,
          className:
            mode === 'INTEGRADO' ? `${stage}A DS` : `ST${course}N${stage}U`,
          courseLabel: course,
          grade: mode === 'INTEGRADO' ? stage : null,
          moduleNumber: mode === 'SUBSEQUENTE' ? stage : null,
          schoolYear: 2026,
          periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
          status: 'ACTIVE',
          reviewedAt: new Date(),
          reviewedById: actor,
          progressionHeld: held,
          validFrom: new Date(
            mode === 'INTEGRADO' ? '2026-02-01' : '2026-08-01',
          ),
          validUntil: new Date('2026-12-31'),
          ...(ref
            ? { offeringId: ref.id, calendarModule: stage, calendarRevision: 1 }
            : {}),
        },
      });
      await db.$transaction((tx) =>
        recordAcademicChange(
          tx,
          e,
          { repetitionPending: true, progressionHeld: true },
          {
            actorId: actor,
            kind: 'REPEAT',
            reason: 'Reprovação fictícia.',
            operationKey: randomUUID(),
            effectiveOn: '2026-11-16',
          },
        ),
      );
      e = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
      return { e, st };
    }
    for (const [mode, course, stage, held] of [
      ['INTEGRADO', 'DS', 3, false],
      ['SUBSEQUENTE', 'ADM', 3, true],
      ['SUBSEQUENTE', 'ENF', 4, false],
    ] as const) {
      const p = await waiting(mode, course, stage, held),
        target = await destination(
          mode,
          course,
          stage,
          mode === 'INTEGRADO' ? 'TDS3IN-B' : `ST${course}N${stage}B`,
        );
      const selected = withRepeaterSelections(target, [
        {
          enrollmentId: p.e.id,
          sheetName: target.contexts[0].sheetName,
          version: academicVersion(p.e),
        },
      ]);
      const pre = await previewSheetImport(db, actor, selected);
      await confirmSheetImport(
        db,
        actor,
        selected,
        pre.token,
        true,
        false,
        false,
        true,
      );
      const e = await db.enrollment.findUniqueOrThrow({
        where: { id: p.e.id },
      });
      assert.equal(e.grade ?? e.moduleNumber, stage);
      assert.equal(e.progressionHeld, held);
      assert.equal(e.status, 'ACTIVE');
      assert.equal(e.repetitionPending, false);
      const again = await previewSheetImport(db, actor, target);
      await confirmSheetImport(
        db,
        actor,
        target,
        again.token,
        true,
        false,
        false,
      );
      assert.deepEqual(
        await db.enrollment.findUniqueOrThrow({ where: { id: p.e.id } }),
        e,
        'Reimportação não desfaz a enturmação.',
      );
    }
    const onFile = await waiting('SUBSEQUENTE', 'DS', 1);
    const f = schoolHeaderFixture('SUBSEQUENTE', 'DS', 1, '2027.1', 'STDSIN1D');
    f.wb.Sheets['Fictícia'].A7 = { t: 's', v: onFile.st.schoolRegistration! };
    const h = (await inspectSchoolSheet(f.file(), 'SUBSEQUENTE', true))[0];
    const incoming = await parseSheetInput(
      f.file(),
      'SUBSEQUENTE',
      [
        {
          sheetName: h.sheetName,
          scopeId: h.scopeId!,
          className: h.classCode!,
          periodLabel: h.periodLabel!,
          courseLabel: h.courseLabel,
          stage: h.stage,
          sourceChoice: 'header',
          confirmed: true,
          bindings: {},
        },
      ],
      true,
    );
    const bound = withRepeaterSelections(incoming, [
      {
        enrollmentId: onFile.e.id,
        sheetName: h.sheetName,
        version: academicVersion(onFile.e),
      },
    ]);
    const beforeIdentity = await previewSheetImport(db, actor, bound);
    assert.equal(beforeIdentity.counts.createdStudents, 0);
    assert.equal(beforeIdentity.counts.createdEnrollments, 0);
    assert.equal(beforeIdentity.placements[0].inFile, true);
    assert.equal(beforeIdentity.counts.conflicts, 0);
    await assert.rejects(
      confirmSheetImport(
        db,
        actor,
        bound,
        beforeIdentity.token,
        true,
        false,
        false,
        true,
      ),
      /alterações de nome/,
    );
    await confirmSheetImport(
      db,
      actor,
      bound,
      beforeIdentity.token,
      true,
      true,
      false,
      true,
    );
    const updated = await db.enrollment.findUniqueOrThrow({
      where: { id: onFile.e.id },
    });
    assert.equal(updated.status, 'UNCONFIRMED');
    assert.equal(updated.reviewedAt, null);
    assert.equal(updated.progressionHeld, true);
    assert.equal(updated.repetitionPending, false);
    assert.equal(
      await db.enrollment.count({ where: { studentId: onFile.st.id } }),
      1,
    );
    for (let i = 0; i < 21; i++) await waiting('SUBSEQUENTE', 'ADM', 1);
    const paged = await destination('SUBSEQUENTE', 'ADM', 1, 'STADMN1P');
    const firstPage = await suggestRepeaterPlacements(
        db,
        actor,
        paged,
        paged.contexts[0].sheetName,
        1,
      ),
      secondPage = await suggestRepeaterPlacements(
        db,
        actor,
        paged,
        paged.contexts[0].sheetName,
        2,
      );
    assert.equal(firstPage.candidates.length, 20);
    assert.equal(firstPage.hasNext, true);
    assert.equal(secondPage.candidates.length, 1);
    assert.equal(secondPage.hasNext, false);
    assert.ok(
      !firstPage.candidates.some(
        (c) => c.enrollmentId === secondPage.candidates[0].enrollmentId,
      ),
    );
    console.log(
      'OK: repetente presente noXLS não duplica matrícula; identidade alterada exige conferência, sugestões paginadas20.',
    );
    const one = await waiting('SUBSEQUENTE', 'DS', 1),
      two = await waiting('SUBSEQUENTE', 'DS', 1),
      target = await destination('SUBSEQUENTE', 'DS', 1, 'STDSIN1C');
    const conflictOwner = await db.student.create({
      data: {
        fullName: 'Conflito fictício',
        birthDate: new Date('2000-01-01'),
      },
    });
    const conflict = await db.enrollment.create({
      data: {
        studentId: conflictOwner.id,
        mode: 'SUBSEQUENTE',
        className: 'STDSIN1C',
        courseLabel: 'DS',
        moduleNumber: 1,
        schoolImportKey: `school:${target.contexts[0].scopeId}:${two.st.schoolRegistration}`,
      },
    });
    const selected = withRepeaterSelections(
      target,
      [one, two].map((p) => ({
        enrollmentId: p.e.id,
        sheetName: target.contexts[0].sheetName,
        version: academicVersion(p.e),
      })),
    );
    const pre = await previewSheetImport(db, actor, selected),
      before = await db.student.count();
    await assert.rejects(
      confirmSheetImport(
        db,
        actor,
        selected,
        pre.token,
        true,
        false,
        false,
        true,
      ),
      /mudou/,
    );
    assert.equal(
      await db.student.count(),
      before,
      'Falha após escritas deve desfazer também alunos da planilha.',
    );
    for (const p of [one, two]) {
      assert.equal(
        (await db.enrollment.findUniqueOrThrow({ where: { id: p.e.id } }))
          .repetitionPending,
        true,
      );
      assert.equal(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: p.e.id, kind: 'TRANSFER' },
        }),
        0,
      );
    }
    assert.equal(
      await db.courseOffering.count({
        where: { id: target.contexts[0].scopeId },
      }),
      0,
      'Referência criada também sofre rollback.',
    );
    await db.enrollment.delete({ where: { id: conflict.id } });
    const fresh = await previewSheetImport(db, actor, selected);
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        confirmSheetImport(
          db,
          actor,
          selected,
          fresh.token,
          true,
          false,
          false,
          true,
        ),
      ),
    );
    assert.ok(outcomes.some((o) => o.status === 'fulfilled'));
    for (const p of [one, two])
      assert.equal(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: p.e.id, kind: 'TRANSFER' },
        }),
        1,
        'Concorrência não duplica eventos.',
      );
    console.log(
      'OK: integrado/ADM3/ENF4, suspensão prévia, reimportação, rollback após escrita e confirmação concorrente.',
    );
    console.log(
      'OK: papel, versão, etapa/modalidade, referência alterada e exceção com vigência revalidados no servidor.',
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
