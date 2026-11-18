import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { listAuditHistory } from '../src/lib/audit-history';
import { parseAuditFilters } from '../src/lib/audit-history-input';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  assert.equal(parseAuditFilters({ inicio: '2026-02-30' }), null);
  assert.equal(parseAuditFilters({ categoria: ['ACESSO', 'MATRICULA'] }), null);
  assert.equal(parseAuditFilters({ pagina: '0' }), null);
  const env = await openTestEnvironment();
  const { db } = env;
  try {
    const actor = await db.student.create({
      data: {
        fullName: 'Operadora fictícia',
        birthDate: new Date('1980-01-01'),
      },
    });
    const student = await db.student.create({
      data: {
        fullName: 'Pessoa fictícia auditada',
        birthDate: new Date('2006-01-01'),
        schoolRegistration: '00001123',
      },
    });
    const secretary = await db.account.create({
      data: {
        studentId: actor.id,
        email: 'secretaria.audit@example.invalid',
        passwordHash: 'hash-sintetico',
        role: 'secretary',
        status: 'active',
      },
    });
    const learner = await db.account.create({
      data: { studentId: student.id },
    });

    const access = await db.studentAccessChange.create({
      data: {
        studentId: student.id,
        createdById: secretary.id,
        blocked: true,
        kind: 'LOGIN',
        reason: 'Bloqueio fictício',
        requestKey: randomUUID(),
        revision: 1,
        createdAt: new Date('2026-11-17T02:59:59Z'),
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        studentId: student.id,
        mode: 'INTEGRADO',
        className: '1A DS',
        grade: 1,
        courseLabel: 'DS',
      },
    });
    const automatic = await db.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { academicRevision: 1 },
      });
      return tx.schoolAcademicEvent.create({
        data: {
          enrollmentId: enrollment.id,
          operationKey: randomUUID(),
          kind: 'PROGRESSION',
          revision: 1,
          effectiveOn: new Date('2026-11-17'),
          createdAt: new Date('2026-11-17T03:00:01Z'),
          beforeState: {
            reviewedById: secretary.id,
            reviewedAt: '2026-10-10T11:00:00Z',
            privateFixture: 'dados-excluidos-da-consulta',
          },
          afterState: { className: '2A DS' },
          reason: 'Mudança automática fictícia',
        },
      });
    });

    const both = parseAuditFilters({ aluno: '0000112' })!;
    assert.equal(await listAuditHistory(learner.id, both), null);
    assert.equal(await listAuditHistory(randomUUID(), both), null);
    const result = await listAuditHistory(secretary.id, both);
    assert.ok(result);
    assert.deepEqual(
      result.events.map((item) => item.id),
      [automatic.id, access.id],
    );
    assert.equal(result.events[0].actor, null);
    assert.equal(result.events[0].confirmedBy, 'Operadora fictícia');
    assert.equal(result.events[0].confirmedAt, '2026-10-10T11:00:00Z');
    assert.equal(result.events[0].automatic, true);
    assert.doesNotMatch(
      JSON.stringify(result),
      /dados-excluidos-da-consulta|passwordHash|secretaria\.audit|beforeState|afterState/,
    );

    const onlyFromMidnight = await listAuditHistory(
      secretary.id,
      parseAuditFilters({ inicio: '2026-11-17', fim: '2026-11-17' })!,
    );
    assert.deepEqual(
      onlyFromMidnight?.events.map((item) => item.category),
      ['MATRICULA'],
    );
    const byName = await listAuditHistory(
      secretary.id,
      parseAuditFilters({ aluno: 'FICTÍCIA AUDITADA', categoria: 'ACESSO' })!,
    );
    assert.deepEqual(
      byName?.events.map((item) => item.id),
      [access.id],
    );

    await db.studentAccessChange.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        studentId: student.id,
        createdById: secretary.id,
        kind: 'ISSUANCE',
        blocked: false,
        requestKey: randomUUID(),
        reason: 'Evento fictício de paginação',
        revision: index + 2,
        createdAt: new Date('2026-11-17T03:00:01Z'),
      })),
    });
    const first = await listAuditHistory(secretary.id, parseAuditFilters({})!);
    const second = await listAuditHistory(
      secretary.id,
      parseAuditFilters({ pagina: '2' })!,
    );
    assert.equal(first?.events.length, 20);
    assert.equal(first?.hasNext, true);
    assert.equal(second?.events.length, 2);
    assert.equal(second?.hasNext, false);
    assert.equal(
      new Set(
        [...(first?.events ?? []), ...(second?.events ?? [])].map(
          (item) => item.id,
        ),
      ).size,
      22,
    );

    await db.account.update({
      where: { id: secretary.id },
      data: { status: 'pending' },
    });
    assert.equal(await listAuditHistory(secretary.id, both), null);
    console.log(
      'OK: autorização reconferida, paginação, data local, categoria, aluno, autoria e minimização de dados no histórico.',
    );
  } finally {
    await env.close();
  }
}

main().catch(reportTestFailure);
