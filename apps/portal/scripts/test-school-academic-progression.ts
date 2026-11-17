import assert from 'node:assert/strict';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { schoolClassSchedule } from '../src/lib/school-class-input';
import {
  applyStudentAcademicProgression,
  academicInclude,
} from '../src/lib/school-academic';
import { requireCurrentEnrollment } from '../src/lib/enrollment-validity';
import { subsequentContext } from '../src/lib/declarations';

async function main() {
  const env = await openTestEnvironment();
  const rollback = new Error('Descartar prova sintética');
  try {
    assert.equal(await env.db.student.count(), 0);
    await assert.rejects(
      env.db.$transaction(
        async (tx) => {
          const staff = await tx.student.create({
            data: {
              fullName: 'Secretaria fictícia',
              birthDate: new Date('2000-01-01'),
              account: {
                create: {
                  role: 'secretary',
                  status: 'active',
                  email: 'secretaria-academica@example.invalid',
                  passwordHash: 'hash-ficticio',
                },
              },
            },
            include: { account: true },
          });
          const student = await tx.student.create({
            data: {
              fullName: 'Aluno fictício',
              birthDate: new Date('2000-01-01'),
            },
          });
          const course = await tx.courseOffering.create({
            data: {
              label: 'STDSIN1U',
              courseLabel: 'DS',
              calendars: {
                create: {
                  revision: 1,
                  schedule: schoolClassSchedule('DS', 1, '2026.2', 'STDSIN1U'),
                  createdById: staff.account!.id,
                },
              },
            },
          });
          const enrollment = await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: 'SUBSEQUENTE',
              className: 'STDSIN1U',
              courseLabel: 'DS',
              moduleNumber: 1,
              calendarModule: 1,
              offeringId: course.id,
              calendarRevision: 1,
              schoolYear: 2026,
              periodLabel: '2026.2',
              status: 'ACTIVE',
              reviewedAt: new Date('2026-08-01T12:00:00Z'),
              reviewedById: staff.account!.id,
              validFrom: new Date('2026-08-01'),
              validUntil: new Date('2026-12-31'),
              progressionHeld: false,
            },
          });
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-01-31T12:00:00Z'),
          );
          let row = await tx.enrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
            include: academicInclude,
          });
          assert.equal(row.moduleNumber, 1);
          assert.equal(row.periodLabel, '2026.2');
          requireCurrentEnrollment(
            row,
            '2026.2',
            new Date('2027-01-31T12:00:00Z'),
          );
          assert.equal(
            subsequentContext(row, new Date('2027-01-31T12:00:00Z'))
              .moduleNumber,
            1,
          );
          assert.equal(await tx.schoolAcademicEvent.count(), 1);
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T02:59:59Z'),
          );
          assert.equal(await tx.schoolAcademicEvent.count(), 1);
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T03:00:00Z'),
          );
          row = await tx.enrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
            include: academicInclude,
          });
          assert.equal(row.moduleNumber, 2);
          assert.equal(row.className, 'STDSIN2U');
          assert.equal(row.periodLabel, '2027.1');
          assert.equal(row.status, 'ACTIVE');
          assert.equal(row.reviewedById, staff.account!.id);
          requireCurrentEnrollment(
            row,
            '2027.1',
            new Date('2027-02-01T03:00:00Z'),
          );
          assert.equal(
            subsequentContext(row, new Date('2027-02-01T03:00:00Z'))
              .moduleNumber,
            2,
          );
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T03:00:00Z'),
          );
          assert.equal(await tx.schoolAcademicEvent.count(), 2);
          const history = await tx.schoolAcademicEvent.findMany({
            orderBy: { revision: 'asc' },
          });
          assert.ok(
            history.every((e) => e.actorId === null),
            'Execução automática não atribui decisão ao aluno.',
          );
          assert.equal(history[1].kind, 'PROGRESSION');
          assert.equal(
            JSON.stringify(history).includes('Aluno fictício'),
            false,
          );
          assert.equal(
            row.entryStartedOn!.toISOString().slice(0, 10),
            '2026-08-01',
          );
          const held = await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: 'INTEGRADO',
              className: '1A DS',
              courseLabel: 'DS',
              grade: 1,
              schoolYear: 2026,
              periodLabel: '2026',
              status: 'ACTIVE',
              reviewedAt: new Date('2026-02-01'),
              reviewedById: staff.account!.id,
              validFrom: new Date('2026-02-01'),
              validUntil: new Date('2026-12-31'),
              progressionHeld: true,
            },
          });
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T12:00:00Z'),
          );
          assert.equal(
            (await tx.enrollment.findUniqueOrThrow({ where: { id: held.id } }))
              .grade,
            1,
          );
          const integrated = await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: 'INTEGRADO',
              className: '1A DS',
              courseLabel: 'DS',
              grade: 1,
              schoolYear: 2026,
              periodLabel: '2026',
              status: 'ACTIVE',
              reviewedAt: new Date('2026-02-01'),
              reviewedById: staff.account!.id,
              validFrom: new Date('2026-02-01'),
              validUntil: new Date('2026-12-31'),
              progressionHeld: false,
            },
          });
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T02:59:59Z'),
          );
          assert.equal(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: integrated.id },
              })
            ).grade,
            1,
          );
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2027-02-01T03:00:00Z'),
          );
          assert.equal(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: integrated.id },
              })
            ).grade,
            2,
          );
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2030-02-01T03:00:00Z'),
          );
          const finalIntegrated = await tx.enrollment.findUniqueOrThrow({
            where: { id: integrated.id },
          });
          assert.equal(finalIntegrated.grade, 3);
          assert.equal(finalIntegrated.status, 'ACTIVE');
          const nursing = await tx.courseOffering.create({
            data: {
              label: 'STENFN1U',
              courseLabel: 'ENF',
              calendars: {
                create: {
                  revision: 1,
                  schedule: schoolClassSchedule('ENF', 1, '2026.2', 'STENFN1U'),
                  createdById: staff.account!.id,
                },
              },
            },
          });
          const nursingEnrollment = await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: 'SUBSEQUENTE',
              className: 'STENFN1U',
              courseLabel: 'ENF',
              moduleNumber: 1,
              calendarModule: 1,
              calendarRevision: 1,
              offeringId: nursing.id,
              schoolYear: 2026,
              periodLabel: '2026.2',
              status: 'ACTIVE',
              reviewedAt: new Date('2026-08-01'),
              reviewedById: staff.account!.id,
              validFrom: new Date('2026-08-01'),
              validUntil: new Date('2026-12-31'),
              progressionHeld: false,
            },
          });
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2028-02-01T02:59:59Z'),
          );
          assert.equal(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: nursingEnrollment.id },
              })
            ).moduleNumber,
            3,
          );
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2028-02-01T03:00:00Z'),
          );
          const finalNursing = await tx.enrollment.findUniqueOrThrow({
            where: { id: nursingEnrollment.id },
          });
          assert.equal(finalNursing.moduleNumber, 4);
          assert.equal(finalNursing.status, 'ACTIVE');
          await applyStudentAcademicProgression(
            tx,
            student.id,
            new Date('2030-08-01T03:00:00Z'),
          );
          assert.equal(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: nursingEnrollment.id },
              })
            ).moduleNumber,
            4,
          );
          throw rollback;
        },
        { timeout: 15000 },
      ),
      (e: unknown) => {
        if (e !== rollback) throw e;
        return true;
      },
    );
    assert.equal(await env.db.student.count(), 0);
    assert.equal(await env.db.schoolAcademicEvent.count(), 0);
    console.log(
      'OK: férias sem antecipação, passagem automática no Recife, original/revisão preservados, histórico atômico e reexecução sem duplicação.',
    );
  } finally {
    await env.close();
  }
}
main().catch((error) => {
  if (error instanceof Error) {
    console.error(
      'Diagnóstico sintético:',
      error.name,
      error instanceof assert.AssertionError
        ? `${String(error.actual)} / ${String(error.expected)}`
        : '',
    );
  }
  reportTestFailure(error);
});
