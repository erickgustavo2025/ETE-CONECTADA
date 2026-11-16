import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const env = await openTestEnvironment();
  const rollback = new Error('Descartar transação sintética.');
  try {
    assert.equal(await env.db.student.count(), 0);
    await assert.rejects(
      env.db.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            fullName: 'Pessoa fictícia passagem',
            birthDate: new Date('2000-01-01'),
          },
        });
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: student.id,
            mode: 'INTEGRADO',
            className: '1A DS',
            grade: 1,
            courseLabel: 'DS',
          },
        });
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { academicRevision: 1 },
        });
        const id = randomUUID(),
          key = randomUUID();
        await tx.$executeRaw`INSERT INTO school_academic_events(id,enrollment_id,kind,operation_key,revision,before_state,after_state,effective_on,reason) VALUES(${id}::uuid,${enrollment.id}::uuid,'PROGRESSION',${key},1,'{}'::jsonb,'{}'::jsonb,'2027-02-01','Passagem automática sintética')`;
        // Cada tentativa inválida tem savepoint: a rejeição não descarta as provas seguintes.
        for (const sql of [
          'UPDATE school_academic_events SET reason=reason',
          'DELETE FROM school_academic_events',
          'TRUNCATE school_academic_events',
        ]) {
          await tx.$executeRawUnsafe('SAVEPOINT rejected_write');
          await assert.rejects(tx.$executeRawUnsafe(sql));
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT rejected_write');
        }
        await tx.$executeRawUnsafe('SAVEPOINT rejected_delete');
        await assert.rejects(tx.student.delete({ where: { id: student.id } }));
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT rejected_delete');
        assert.equal(
          Number(
            (
              await tx.$queryRaw<
                Array<{ n: bigint }>
              >`SELECT count(*) AS n FROM school_academic_events`
            )[0].n,
          ),
          1,
        );
        throw rollback;
      }),
      (e: unknown) => e === rollback,
    );
    assert.equal(await env.db.student.count(), 0);
    assert.equal(
      Number(
        (
          await env.db.$queryRaw<
            Array<{ n: bigint }>
          >`SELECT count(*) AS n FROM school_academic_events`
        )[0].n,
      ),
      0,
    );
    console.log(
      'OK: eventos acadêmicos recusam edição, exclusão, limpeza e cascata; rollback integral sem dados residuais.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
