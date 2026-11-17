import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { manageAcademicEnrollment } from '../src/lib/school-academic-administration';
import { readAcademicAdminInput } from '../src/lib/school-academic-input';
import { requireAcademicRequestAccess } from '../src/lib/school-academic';
async function main() {
  const env = await openTestEnvironment(),
    rollback = new Error('Descartar prova de administração');
  try {
    assert.equal(await env.db.student.count(), 0);
    await assert.rejects(
      env.db.$transaction(
        async (tx) => {
          const staff = await tx.student.create({
            data: {
              fullName: 'Responsável fictício',
              birthDate: new Date('2000-01-01'),
              account: {
                create: {
                  role: 'secretary',
                  status: 'active',
                  email: 'secretaria-academica@example.invalid',
                  passwordHash: 'ficticio',
                },
              },
            },
            include: { account: true },
          });
          const student = await tx.student.create({
            data: {
              fullName: 'Aluno fictício',
              birthDate: new Date('2000-01-01'),
              account: {
                create: {
                  role: 'student',
                  status: 'active',
                  email: 'aluno-academico@example.invalid',
                  passwordHash: 'ficticio',
                },
              },
            },
            include: { account: true },
          });
          const row = await tx.enrollment.create({
            data: {
              studentId: student.id,
              mode: 'INTEGRADO',
              className: '1A DS',
              courseLabel: 'DS',
              grade: 1,
              periodLabel: '2026',
              schoolYear: 2026,
              validFrom: new Date('2026-02-01'),
              validUntil: new Date('2026-12-31'),
            },
          });
          const now = new Date('2026-11-16T12:00:00Z'),
            detail = {
              operation: 'detail' as const,
              enrollmentId: row.id,
              page: 1,
            };
          await assert.rejects(
            manageAcademicEnrollment(tx, student.account!.id, detail, now),
            /Somente a secretaria/,
          );
          let current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            detail,
            now,
          );
          const input = (
            action: string,
            version = current.enrollment.version,
            key = randomUUID(),
          ) =>
            readAcademicAdminInput({
              operation: 'change',
              enrollmentId: row.id,
              action,
              version,
              requestKey: key,
              reason: 'Situação escolar fictícia conferida.',
              confirmed: true,
            });
          const enable = input('ENABLE');
          current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            enable,
            now,
          );
          assert.equal(current.enrollment.status, 'ACTIVE');
          assert.equal(current.academicWaiting, false);
          assert.equal(current.enrollment.progressionHeld, false);
          const oldVersion = current.enrollment.version;
          const repeat = input('REPEAT');
          current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            repeat,
            now,
          );
          assert.equal(current.enrollment.repetitionPending, true);
          assert.equal(current.academicWaiting, true);
          assert.equal(current.enrollment.stage, 1);
          await assert.rejects(
            requireAcademicRequestAccess(tx, student.id),
            /aguardando uma nova turma/,
          );
          const replay = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            repeat,
            now,
          );
          assert.equal(replay.created, false);
          assert.equal(replay.total, 3);
          await assert.rejects(
            manageAcademicEnrollment(
              tx,
              staff.account!.id,
              input('RESUME', oldVersion),
              now,
            ),
            /mudou/,
          );
          await assert.rejects(
            manageAcademicEnrollment(
              tx,
              staff.account!.id,
              readAcademicAdminInput({
                ...repeat,
                action: 'RESUME',
                confirmed: true,
              }),
              now,
            ),
            /tentativa já foi usada/,
          );
          current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            input('RESUME'),
            now,
          );
          assert.equal(current.enrollment.repetitionPending, false);
          assert.equal(current.enrollment.progressionHeld, false);
          await requireAcademicRequestAccess(tx, student.id);
          assert.equal(current.total, 4);
          assert.ok(
            current.history.some((e) => e.actor === 'Responsável fictício'),
          );
          current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            detail,
            new Date('2027-02-01T12:00:00Z'),
          );
          assert.equal(current.enrollment.stage, 2);
          const previous = readAcademicAdminInput({
            operation: 'change',
            enrollmentId: row.id,
            action: 'REPEAT_PREVIOUS',
            version: current.enrollment.version,
            requestKey: randomUUID(),
            reason: 'Reprovação anterior comunicada após a virada.',
            confirmed: true,
          });
          current = await manageAcademicEnrollment(
            tx,
            staff.account!.id,
            previous,
            new Date('2027-02-01T12:00:00Z'),
          );
          assert.equal(current.enrollment.stage, 1);
          assert.equal(current.enrollment.repetitionPending, true);
          assert.equal(current.academicWaiting, true);
          await assert.rejects(
            requireAcademicRequestAccess(tx, student.id),
            /aguardando/,
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
      'OK: secretaria reconferida, aluno recusado, ativação inicial, repetência/retorno auditados, bloqueio geral, versão e reenvio idempotente.',
    );
  } finally {
    await env.close();
  }
}
main().catch((error) => {
  if (error instanceof Error)
    console.error(
      'Diagnóstico sintético:',
      error.name,
      'code' in error ? String(error.code) : '',
      error.message
        .split('\n')
        .filter((line) =>
          /constraint|Error:|confira|mudou|date|json|value|column/i.test(line),
        )
        .join(' ')
        .slice(-400),
    );
  reportTestFailure(error);
});
