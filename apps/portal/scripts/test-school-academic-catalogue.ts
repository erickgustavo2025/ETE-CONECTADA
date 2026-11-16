import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { synchronizeCatalogueBatch } from '../src/lib/school-academic-catalogue';
async function main() {
  const env = await openTestEnvironment(),
    rollback = new Error('Descartar lote acadêmico sintético');
  try {
    assert.equal(await env.db.student.count(), 0);
    await assert.rejects(
      env.db.$transaction(
        async (tx) => {
          const staff = await tx.student.create({
            data: {
              fullName: 'Secretaria fictícia de lote',
              birthDate: new Date('2000-01-01'),
              account: {
                create: {
                  role: 'secretary',
                  status: 'active',
                  email: 'lote@example.invalid',
                  passwordHash: 'ficticio',
                },
              },
            },
            include: { account: true },
          });
          const ids = Array.from({ length: 201 }, () => randomUUID());
          await tx.student.createMany({
            data: ids.map((id) => ({
              id,
              fullName: 'Aluno fictício de lote',
              birthDate: new Date('2000-01-01'),
            })),
          });
          await tx.enrollment.createMany({
            data: ids.map((studentId) => ({
              studentId,
              mode: 'INTEGRADO' as const,
              className: '1A DS',
              courseLabel: 'DS',
              grade: 1,
              schoolYear: 2025,
              periodLabel: '2025',
              status: 'ACTIVE' as const,
              progressionHeld: false,
              reviewedAt: new Date('2025-02-01'),
              reviewedById: staff.account!.id,
              validFrom: new Date('2025-02-01'),
              validUntil: new Date('2025-12-31'),
            })),
          });
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
          const now = new Date('2026-02-01T03:00:00Z');
          const first = await synchronizeCatalogueBatch(
            tx,
            'INTEGRADO',
            null,
            now,
          );
          assert.equal(first.processed, 200);
          assert.equal(first.advanced, 200);
          assert.ok(first.nextCursor);
          const last = await synchronizeCatalogueBatch(
            tx,
            'INTEGRADO',
            first.nextCursor,
            now,
          );
          assert.equal(last.advanced, 1);
          assert.equal(last.nextCursor, null);
          assert.equal(
            await tx.enrollment.count({
              where: { grade: 2, periodLabel: '2026', status: 'ACTIVE' },
            }),
            201,
          );
          assert.equal(
            await tx.schoolAcademicEvent.count({
              where: { kind: 'PROGRESSION' },
            }),
            201,
          );
          assert.equal(
            await tx.schoolAcademicEvent.count({
              where: { kind: 'CONTINUITY' },
            }),
            201,
          );
          assert.equal(await tx.schoolAcademicEvent.count(), 402);
          assert.equal(
            (await synchronizeCatalogueBatch(tx, 'INTEGRADO', null, now))
              .processed,
            0,
          );
          assert.equal(await tx.schoolAcademicEvent.count(), 402);
          assert.equal(
            (await synchronizeCatalogueBatch(tx, 'SUBSEQUENTE', null, now))
              .processed,
            0,
          );
          throw rollback;
        },
        { timeout: 15000 },
      ),
      (e) => {
        if (e !== rollback) throw e;
        return true;
      },
    );
    assert.equal(await env.db.student.count(), 0);
    assert.equal(await env.db.schoolAcademicEvent.count(), 0);
    console.log(
      'OK: catálogo atualiza 201 alunos em lotes de 200, modo/cursor, passagem única e rollback sem resíduos.',
    );
  } finally {
    await env.close();
  }
}
main().catch((e: unknown) => {
  if (e instanceof assert.AssertionError)
    console.error('Asserção sintética:', String(e.actual), String(e.expected));
  else if (e && typeof e === 'object')
    console.error(
      'Erro sintético:',
      String((e as { name?: string }).name),
      String((e as { code?: string }).code),
    );
  reportTestFailure(e);
});
