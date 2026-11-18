import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { updateStudentDetails } from '../src/lib/student-details';
import {
  requestDeclaration,
  RequestError,
} from '../src/lib/declaration-requests';

async function main() {
  const environment = await openTestEnvironment();
  const { db } = environment;
  const ids: string[] = [];
  const place = { state: 'PE', municipalityId: '2611606' };
  try {
    assert.equal(await db.student.count(), 0, 'Exige banco descartável vazio.');
    for (const name of [
      'Aluno fictício de naturalidade',
      'Outro aluno fictício',
    ]) {
      ids.push(
        (
          await db.student.create({
            data: {
              fullName: name,
              birthDate: new Date('2000-01-01T00:00:00Z'),
              details: {
                create: {
                  parentOne: 'Filiação fictícia',
                  parentageSource: 'SCHOOL_RECORD',
                },
              },
            },
          })
        ).id,
      );
    }
    const accounts = await Promise.all(
      ids.map((studentId) =>
        db.account.create({
          data: {
            studentId,
            email: `${randomUUID()}@example.invalid`,
            passwordHash: 'hash-ficticio-sem-login',
            status: 'active',
            role: 'student',
          },
        }),
      ),
    );
    const enrollments = await Promise.all(
      ids.map((studentId) =>
        db.enrollment.create({
          data: {
            studentId,
            mode: 'INTEGRADO',
            className: 'Turma fictícia',
            grade: 2,
            courseLabel: 'DS',
          },
        }),
      ),
    );
    const options = { accountId: accounts[0].id, birthplace: place };
    // Falha real no INSERT deve desfazer também o local atualizado na transação.
    await db.$executeRaw`CREATE FUNCTION test_birthplace_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintética de gravação'; END $$`;
    try {
      await db.$executeRaw`CREATE TRIGGER test_birthplace_reject BEFORE INSERT ON declaration_requests FOR EACH ROW EXECUTE FUNCTION test_birthplace_reject()`;
      await assert.rejects(
        requestDeclaration(ids[0], enrollments[0].id, options),
      );
      assert.equal(
        (
          await db.studentDetails.findUniqueOrThrow({
            where: { studentId: ids[0] },
          })
        ).birthCity,
        null,
      );
      assert.equal(await db.declarationRequest.count(), 0);
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS test_birthplace_reject ON declaration_requests`;
      await db.$executeRaw`DROP FUNCTION test_birthplace_reject()`;
    }
    const result = await requestDeclaration(ids[0], enrollments[0].id, options);
    assert.equal(result.created, true);
    const details = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: ids[0] },
    });
    assert.equal(details.birthCity, 'Recife');
    assert.equal(details.birthState, 'PE');
    assert.equal(details.birthplaceSource, 'STUDENT_DECLARATION');
    assert.equal(details.updatedById, accounts[0].id);
    assert.equal(details.parentOne, 'Filiação fictícia');
    assert.equal(details.parentageSource, 'SCHOOL_RECORD');
    assert.equal(
      (
        await db.studentDetails.findUniqueOrThrow({
          where: { studentId: ids[1] },
        })
      ).birthCity,
      null,
    );
    const repeated = await requestDeclaration(ids[0], enrollments[0].id, {
      ...options,
      birthplace: { state: 'PE', municipalityId: '2609600' },
    });
    assert.equal(repeated.created, false);
    assert.equal(repeated.request.id, result.request.id);
    assert.equal(
      (
        await db.studentDetails.findUniqueOrThrow({
          where: { studentId: ids[0] },
        })
      ).birthCity,
      'Recife',
      'Repetição não muda local de pedido em atendimento.',
    );
    for (const birthplace of [
      { state: 'SP', municipalityId: '2611606' },
      { ...place, source: 'SCHOOL_RECORD' },
      { ...place, studentId: ids[1] },
    ])
      await assert.rejects(
        requestDeclaration(ids[1], enrollments[1].id, {
          accountId: accounts[1].id,
          birthplace,
        }),
      );
    assert.equal(
      await db.declarationRequest.count({ where: { studentId: ids[1] } }),
      0,
    );
    await assert.rejects(
      requestDeclaration(ids[0], enrollments[1].id, options),
    );
    await assert.rejects(
      requestDeclaration(ids[0], enrollments[0].id, {
        ...options,
        accountId: accounts[1].id,
      }),
    );
    await db.studentDetails.update({
      where: { studentId: ids[1] },
      data: {
        birthCity: 'Olinda',
        birthState: 'PE',
        birthCountry: 'BR',
        birthplaceSource: 'SECRETARY_CORRECTION',
      },
    });
    await assert.rejects(
      requestDeclaration(ids[1], enrollments[1].id, {
        accountId: accounts[1].id,
        birthplace: place,
      }),
    );
    const kept = await requestDeclaration(ids[1], enrollments[1].id, {
      accountId: accounts[1].id,
    });
    assert.equal(kept.created, true);
    assert.equal(
      (
        await db.studentDetails.findUniqueOrThrow({
          where: { studentId: ids[1] },
        })
      ).birthplaceSource,
      'SECRETARY_CORRECTION',
    );
    await db.account.update({
      where: { id: accounts[0].id },
      data: { status: 'pending' },
    });
    await assert.rejects(
      requestDeclaration(ids[0], enrollments[0].id, options),
    );
    assert.equal(await db.declarationRequest.count(), 2);
    // Contas distintas disputam o mesmo aluno: a correção oficial nunca se perde.
    await db.account.update({
      where: { id: accounts[0].id },
      data: { status: 'active', role: 'secretary' },
    });
    await db.declarationRequest.updateMany({
      where: { studentId: ids[1], status: 'REQUESTED' },
      data: {
        status: 'READY_FOR_PICKUP',
        generatedAt: new Date(),
        readyAt: new Date(),
      },
    });
    await db.studentDetails.update({
      where: { studentId: ids[1] },
      data: {
        birthCity: null,
        birthState: null,
        birthCountry: null,
        birthplaceSource: null,
      },
    });
    const race = await Promise.allSettled([
      requestDeclaration(ids[1], enrollments[1].id, {
        accountId: accounts[1].id,
        birthplace: place,
      }),
      updateStudentDetails(db, accounts[0].id, ids[1], {
        birthplace: {
          city: 'Olinda',
          state: 'PE',
          country: 'BR',
          source: 'SECRETARY_CORRECTION',
        },
      }),
    ]);
    assert.equal(race[1].status, 'fulfilled');
    if (race[0].status === 'rejected') {
      assert.ok(race[0].reason instanceof RequestError);
      assert.equal(race[0].reason.status, 422);
    }
    const corrected = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: ids[1] },
    });
    assert.equal(corrected.birthCity, 'Olinda');
    assert.equal(corrected.birthplaceSource, 'SECRETARY_CORRECTION');
    assert.equal(corrected.parentOne, 'Filiação fictícia');

    console.log(
      'OK: local canônico e pedido atômicos, titularidade/estado da conta, filiação preservada, dados de outro aluno, repetição e correção da secretaria protegidos.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
