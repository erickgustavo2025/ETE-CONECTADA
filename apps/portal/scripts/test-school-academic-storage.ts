import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client';
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
          Prisma.sql`UPDATE school_academic_events SET reason=reason`,
          Prisma.sql`DELETE FROM school_academic_events`,
          Prisma.sql`TRUNCATE school_academic_events`,
        ]) {
          await tx.$executeRaw`SAVEPOINT rejected_write`;
          await assert.rejects(tx.$executeRaw(sql));
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT rejected_write`;
        }
        await tx.$executeRaw`SAVEPOINT rejected_delete`;
        await assert.rejects(tx.student.delete({ where: { id: student.id } }));
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT rejected_delete`;
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
    // Os gatilhos diferidos também precisam rejeitar um commit incompleto,
    // não apenas alterações dentro de uma transação descartada pelo teste.
    for (const orphan of ['revision', 'event'] as const) {
      let reachedCommit = false;
      await assert.rejects(
        env.db.$transaction(async (tx) => {
          const student = await tx.student.create({
            data: {
              fullName: 'Pessoa fictícia consistência acadêmica',
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
          if (orphan === 'revision')
            await tx.enrollment.update({
              where: { id: enrollment.id },
              data: { academicRevision: 1 },
            });
          else
            await tx.$executeRaw`INSERT INTO school_academic_events(enrollment_id,kind,operation_key,revision,before_state,after_state,effective_on,reason) VALUES(${enrollment.id}::uuid,'PROGRESSION',${randomUUID()},1,'{}'::jsonb,'{}'::jsonb,'2027-02-01','Passagem automática sintética')`;
          reachedCommit = true;
        }),
      );
      assert.equal(
        reachedCommit,
        true,
        'A escrita deve chegar à validação do commit.',
      );
      assert.equal(await env.db.student.count(), 0);
      assert.equal(await env.db.schoolAcademicEvent.count(), 0);
    }
    console.log(
      'OK: commits com revisão sem evento ou evento sem revisão são recusados sem resíduos.',
    );
    console.log(
      'OK: eventos acadêmicos recusam edição, exclusão, limpeza e cascata; rollback integral sem dados residuais.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
