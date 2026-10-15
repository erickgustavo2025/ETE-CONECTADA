import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import {
  reviewEnrollment,
  requireCurrentEnrollment,
} from '../src/lib/enrollment-validity';
import {
  requestDeclaration,
  recordGeneratedDeclarations,
  markReadyForPickup,
} from '../src/lib/declaration-requests';

async function main() {
  const environment = await openTestEnvironment();
  const { db } = environment;
  const ids: string[] = [];
  const demoIds: string[] = [];
  try {
    assert.equal(
      await db.student.count(),
      0,
      'Este teste exige banco novo, não a demonstração em uso.',
    );
    for (const name of [
      'Aluno sintético vigência',
      'Secretaria sintética vigência',
    ]) {
      const student = await db.student.create({
        data: { fullName: name, birthDate: new Date('2000-01-15T00:00:00Z') },
      });
      ids.push(student.id);
    }
    const [studentId] = ids;
    const [studentAccount, secretary] = await Promise.all(
      ids.map((id, i) =>
        db.account.create({
          data: {
            studentId: id,
            email: `vigencia-${randomUUID()}@eteconectada.invalid`,
            passwordHash: 'hash-sintetico-sem-login',
            status: 'active',
            role: i === 0 ? 'student' : 'secretary',
          },
        }),
      ),
    );
    const enrollment = await db.enrollment.create({
      data: {
        studentId,
        mode: 'INTEGRADO',
        className: 'Turma sintética vigência',
        grade: 2,
        courseLabel: 'DS',
      },
    });
    const other = await db.enrollment.create({
      data: {
        studentId,
        mode: 'INTEGRADO',
        className: 'Outra matrícula sintética',
        grade: 1,
        courseLabel: 'DS',
      },
    });
    assert.equal(enrollment.status, 'UNCONFIRMED');
    assert.equal(enrollment.validFrom, null);
    assert.throws(() => requireCurrentEnrollment(enrollment), /conferência/);
    const request = (await requestDeclaration(studentId, enrollment.id))
      .request;
    assert.equal(
      request.status,
      'REQUESTED',
      'Pedido pode aguardar conferência.',
    );
    const active = {
      status: 'ACTIVE',
      periodLabel: '2026',
      validFrom: '2000-01-01',
      validUntil: '2099-12-31',
    };
    await assert.rejects(
      reviewEnrollment(db, studentAccount.id, enrollment.id, active),
      /Acesso não autorizado/,
    );
    await assert.rejects(
      db.$executeRaw`UPDATE enrollments SET status='ACTIVE' WHERE id=${enrollment.id}::uuid`,
    );
    const reviewed = await reviewEnrollment(
      db,
      secretary.id,
      enrollment.id,
      active,
    );
    requireCurrentEnrollment(reviewed, '2026');
    assert.equal(reviewed.reviewedById, secretary.id);
    assert.throws(
      () => requireCurrentEnrollment(other),
      /conferência/,
      'Uma matrícula ativa não libera outra.',
    );
    const item = {
      studentId,
      enrollmentId: enrollment.id,
      periodLabel: '2026',
      reviewedAt: reviewed.reviewedAt,
    };
    await assert.rejects(
      recordGeneratedDeclarations(
        [{ ...item, periodLabel: '2025' }],
        secretary.id,
      ),
      /período/,
    );
    await recordGeneratedDeclarations([item], secretary.id);
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
      'IN_PREPARATION',
    );
    await reviewEnrollment(db, secretary.id, enrollment.id, {
      status: 'ENDED',
    });
    await assert.rejects(
      markReadyForPickup(request.id, secretary.id),
      /conferência/,
    );
    assert.equal(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).readyAt,
      null,
    );
    const refreshed = await reviewEnrollment(
      db,
      secretary.id,
      enrollment.id,
      active,
    );
    await assert.rejects(
      recordGeneratedDeclarations(
        [{ ...item, reviewedAt: new Date(0) }],
        secretary.id,
      ),
      /mudou/,
    );
    await db.declarationRequest.update({
      where: { id: request.id },
      data: { generatedAt: new Date(0) },
    });
    await assert.rejects(markReadyForPickup(request.id, secretary.id), /mudou/);
    await recordGeneratedDeclarations(
      [{ ...item, reviewedAt: refreshed.reviewedAt }],
      secretary.id,
    );
    assert.equal(
      (await markReadyForPickup(request.id, secretary.id)).status,
      'READY_FOR_PICKUP',
    );
    assert.equal(
      (await markReadyForPickup(request.id, secretary.id)).status,
      'READY_FOR_PICKUP',
    );
    await reviewEnrollment(db, secretary.id, other.id, {
      ...active,
      validUntil: '1999-12-31',
      validFrom: '1999-01-01',
    });
    assert.throws(
      () =>
        requireCurrentEnrollment({
          ...other,
          ...active,
          validFrom: new Date('1999-01-01'),
          validUntil: new Date('1999-12-31'),
          reviewedAt: new Date(),
        }),
      /vigência/,
    );
    await db.account.update({
      where: { id: secretary.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      reviewEnrollment(db, secretary.id, enrollment.id, { status: 'ENDED' }),
      /Acesso não autorizado/,
    );
    await assert.rejects(
      recordGeneratedDeclarations([item], secretary.id),
      /Acesso não autorizado/,
    );
    await assert.rejects(
      markReadyForPickup(request.id, secretary.id),
      /Acesso não autorizado/,
    );
    await db.student.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;

    // O comando documentado migra/identifica antes do seed e preserva conta/senha e revisões.
    const demo = () => {
      const child = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/prepare-demo.ts'],
        { stdio: 'pipe', env: process.env },
      );
      assert.equal(
        child.status,
        0,
        'db:demo deve preparar somente o banco identificado.',
      );
    };
    try {
      demo();
    } finally {
      const fixtures = await db.student.findMany({
        where: {
          schoolRegistration: { in: ['9900001', '9900002', '9900003'] },
        },
        select: { id: true },
      });
      demoIds.push(...fixtures.map((row) => row.id));
    }
    const account = await db.account.findUniqueOrThrow({
      where: { email: 'aluno.teste@eteconectada.invalid' },
    });
    const fixture = await db.enrollment.findUniqueOrThrow({
      where: { importSourceId: 'seed:9900002' },
    });
    requireCurrentEnrollment(fixture, '2026');
    await db.account.update({
      where: { id: account.id },
      data: { passwordHash: 'hash-ficticio-preservado' },
    });
    const staff = await db.account.findUniqueOrThrow({
      where: { email: 'secretaria.demo@eteconectada.invalid' },
    });
    await reviewEnrollment(db, staff.id, fixture.id, { status: 'ENDED' });
    demo();
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .passwordHash,
      'hash-ficticio-preservado',
    );
    assert.equal(
      (await db.enrollment.findUniqueOrThrow({ where: { id: fixture.id } }))
        .status,
      'ENDED',
    );
    console.log(
      'OK: conferência autorizada, matrículas múltiplas, período, geração/liberação, revisão posterior, revogação e demonstração idempotente.',
    );
  } finally {
    try {
      if (ids.length || demoIds.length)
        await db.student.deleteMany({
          where: { id: { in: [...ids, ...demoIds] } },
        });
    } finally {
      await environment.close();
    }
  }
}
main().catch(reportTestFailure);
