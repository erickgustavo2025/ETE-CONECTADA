import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { completeSchoolEnrollments } from '../src/lib/school-completion';
import { academicVersion } from '../src/lib/school-academic-administration';
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
