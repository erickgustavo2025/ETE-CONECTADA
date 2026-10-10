import { openTestEnvironment, reportTestFailure, TestEnvironmentError } from './test-environment';
import { hashPassword } from '../src/lib/password';

async function main() {
const environment = await openTestEnvironment();
const { db } = environment;
const students = [
  { cpf: '45278196319', schoolRegistration: '9900001', birthDate: '2008-04-17', fullName: 'Ana Silva' },
  { cpf: '63820517480', schoolRegistration: '9900002', birthDate: '2007-11-03', fullName: 'Lucas Oliveira' },
  { cpf: '29471638500', schoolRegistration: '9900003', birthDate: '2009-08-26', fullName: 'Marina Costa' },
];
try {
  const passwordHash = await hashPassword('Teste@12345');
  await db.$transaction(async (tx) => {
    for (const student of students) {
      const birthDate = new Date(`${student.birthDate}T00:00:00Z`);
      const existing = await tx.student.findFirst({ where: { OR: [{ cpf: student.cpf }, { schoolRegistration: student.schoolRegistration }] } });
      if (existing && (existing.cpf !== student.cpf || existing.schoolRegistration !== student.schoolRegistration
        || existing.fullName !== student.fullName || existing.birthDate.getTime() !== birthDate.getTime())) {
        throw new TestEnvironmentError('Colisão com registro diferente da fixture; seed cancelado sem alterações.');
      }
      const record = existing ?? await tx.student.create({ data: { ...student, birthDate } });
      const enrollment = await tx.enrollment.findUnique({ where: { importSourceId: `seed:${student.schoolRegistration}` } });
      if (enrollment && (enrollment.studentId !== record.id || enrollment.mode !== 'INTEGRADO'
        || enrollment.className !== '2B DS' || enrollment.grade !== 2 || enrollment.courseLabel !== 'DS')) throw new TestEnvironmentError('Matrícula de seed difere da fixture esperada.');
      await tx.enrollment.upsert({ where: { importSourceId: `seed:${student.schoolRegistration}` }, update: {}, create: {
        studentId: record.id, mode: 'INTEGRADO', className: '2B DS', grade: 2, courseLabel: 'DS', importSourceId: `seed:${student.schoolRegistration}`,
      } });
    }
    const student = await tx.student.findUniqueOrThrow({ where: { cpf: students[1].cpf } });
    // Reexecutar o seed preserva uma conta que já existe, inclusive sua senha.
    await tx.account.upsert({ where: { studentId: student.id }, update: {}, create: {
      studentId: student.id, email: 'aluno.teste@eteconectada.invalid', passwordHash, status: 'active',
    } });
  }, { timeout: 30000 });
  console.log('Seed concluído: três alunos sintéticos; contas existentes preservadas.');
} finally { await environment.close(); }

}
main().catch(reportTestFailure);
