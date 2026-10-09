import { config } from 'dotenv';
import { getDb } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';

config({ path: '.env.local', quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('Seed sintético indisponível em produção.');
async function main() {
const db = getDb();
const students = [
  { cpf: '45278196319', schoolRegistration: '9900001', birthDate: '2008-04-17', fullName: 'Ana Silva' },
  { cpf: '63820517480', schoolRegistration: '9900002', birthDate: '2007-11-03', fullName: 'Lucas Oliveira' },
  { cpf: '29471638500', schoolRegistration: '9900003', birthDate: '2009-08-26', fullName: 'Marina Costa' },
];
try {
  const passwordHash = await hashPassword('Teste@12345');
  await db.$transaction(async (tx) => {
    for (const student of students) {
      const record = await tx.student.upsert({
        where: { cpf: student.cpf },
        create: { ...student, birthDate: new Date(`${student.birthDate}T00:00:00Z`) },
        update: { fullName: student.fullName, schoolRegistration: student.schoolRegistration },
      });
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
} finally { await db.$disconnect(); }

}
main().catch(error => { console.error('Falha ao carregar o seed. Código:', typeof error?.code === 'string' ? error.code : 'indisponível'); process.exitCode = 1; });
