import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { updateStudentDetails } from '../src/lib/student-details';

async function main() {
  const environment = await openTestEnvironment();
  const { db } = environment;
  const ids: string[] = [];
  try {
    for (const suffix of ['aluno', 'secretaria', 'pendente']) {
      const student = await db.student.create({
        data: {
          fullName: `Teste sintético complemento ${suffix}`,
          birthDate: new Date('2000-01-15T00:00:00Z'),
          schoolRegistration: `details-${randomBytes(8).toString('hex')}`,
        },
      });
      ids.push(student.id);
    }
    const [studentId, staffStudentId, pendingStudentId] = ids;
    const accounts = await Promise.all(
      ids.map((id, i) =>
        db.account.create({
          data: {
            studentId: id,
            email: `details-${randomBytes(8).toString('hex')}@eteconectada.invalid`,
            passwordHash: 'hash-sintetico-sem-login',
            role: i === 0 ? 'student' : 'secretary',
            status: i === 2 ? 'pending' : 'active',
          },
        }),
      ),
    );
    const [studentAccount, secretary, pending] = accounts;
    assert.ok(staffStudentId && pendingStudentId);
    assert.equal(
      await db.studentDetails.findUnique({ where: { studentId } }),
      null,
    );
    const parentage = {
      parentOne: 'Responsável Fictício Um',
      source: 'SCHOOL_RECORD',
    };
    for (const actorId of [studentAccount.id, pending.id, randomUUID()]) {
      await assert.rejects(
        updateStudentDetails(db, actorId, studentId, { parentage }),
        /Acesso não autorizado/,
      );
    }
    assert.equal(
      await db.studentDetails.count(),
      0,
      'Negativas não gravam complemento.',
    );
    await assert.rejects(
      updateStudentDetails(db, secretary.id, randomUUID(), { parentage }),
      /Cadastro não disponível/,
    );
    const first = await updateStudentDetails(db, secretary.id, studentId, {
      parentage,
    });
    assert.equal(first.parentOne, parentage.parentOne);
    assert.equal(first.parentTwo, null);
    assert.equal(first.birthCity, null);
    assert.equal(first.birthplaceSource, null);
    assert.equal(first.updatedById, secretary.id);
    await updateStudentDetails(db, secretary.id, studentId, {
      parentage: { ...parentage, parentTwo: 'Responsável Fictício Dois' },
    });
    const omitted = await updateStudentDetails(db, secretary.id, studentId, {
      parentage,
    });
    assert.equal(
      omitted.parentTwo,
      'Responsável Fictício Dois',
      'Segunda filiação omitida não é apagada.',
    );
    const second = await updateStudentDetails(db, secretary.id, studentId, {
      socialName: { value: 'Nome Social Fictício', source: 'SCHOOL_RECORD' },
      birthplace: {
        city: 'Recife',
        state: 'PE',
        country: 'BR',
        source: 'STUDENT_DECLARATION',
      },
    });
    assert.equal(
      second.parentOne,
      first.parentOne,
      'Grupo omitido permanece intacto.',
    );
    assert.equal(second.parentageSource, 'SCHOOL_RECORD');
    assert.equal(second.birthplaceSource, 'STUDENT_DECLARATION');
    assert.equal(second.birthState, 'PE');
    assert.equal(second.socialName, 'Nome Social Fictício');
    assert.ok(second.updatedAt >= first.updatedAt);
    await updateStudentDetails(db, secretary.id, studentId, {
      socialName: { value: null, source: 'SECRETARY_CORRECTION' },
    });
    const corrected = await db.studentDetails.findUniqueOrThrow({
      where: { studentId },
    });
    assert.equal(corrected.socialName, null);
    assert.equal(corrected.socialNameSource, 'SECRETARY_CORRECTION');
    assert.equal(corrected.parentOne, first.parentOne);
    assert.equal(
      await db.studentDetails.count(),
      1,
      'Atualizações não duplicam complemento.',
    );
    for (const query of [
      () =>
        db.$executeRaw`UPDATE student_details SET birth_state = 'XX' WHERE student_id = ${studentId}::uuid`,
      () =>
        db.$executeRaw`UPDATE student_details SET parentage_source = NULL WHERE student_id = ${studentId}::uuid`,
      () =>
        db.$executeRaw`UPDATE student_details SET parentage_source = 'STUDENT_DECLARATION' WHERE student_id = ${studentId}::uuid`,
    ])
      await assert.rejects(
        query,
        'Constraints devem recusar dado incoerente/origem inválida.',
      );
    await db.account.update({
      where: { id: secretary.id },
      data: { role: 'student' },
    });
    await assert.rejects(
      updateStudentDetails(db, secretary.id, studentId, { parentage }),
      /Acesso não autorizado/,
    );
    assert.deepEqual(
      await db.studentDetails.findUniqueOrThrow({ where: { studentId } }),
      corrected,
    );
    // Remover conta do operador preserva os dados e a origem, sem uma FK órfã.
    await db.account.delete({ where: { id: secretary.id } });
    assert.equal(
      (await db.studentDetails.findUniqueOrThrow({ where: { studentId } }))
        .updatedById,
      null,
    );
    console.log(
      'OK: complemento ausente, persistência, origem, correção parcial, permissões, revogação, constraints e preservação após saída do operador.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
