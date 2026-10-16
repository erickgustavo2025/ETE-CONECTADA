import {
  openTestEnvironment,
  reportTestFailure,
  TestEnvironmentError,
} from './test-environment';
import { hashPassword } from '../src/lib/password';
import { reviewEnrollment } from '../src/lib/enrollment-validity';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--demo') || args.length > 1)
    throw new TestEnvironmentError('Use seed sem argumentos ou com --demo.');
  const demo = args.includes('--demo');
  const environment = await openTestEnvironment();
  const { db } = environment;
  const students = [
    {
      cpf: '45278196319',
      schoolRegistration: '9900001',
      birthDate: '2008-04-17',
      fullName: 'Ana Silva',
    },
    {
      cpf: '63820517480',
      schoolRegistration: '9900002',
      birthDate: '2007-11-03',
      fullName: 'Lucas Oliveira',
    },
    {
      cpf: '29471638500',
      schoolRegistration: '9900003',
      birthDate: '2009-08-26',
      fullName: 'Marina Costa',
    },
  ];
  try {
    const passwordHash = await hashPassword('Teste@12345');
    await db.$transaction(
      async (tx) => {
        for (const student of students) {
          const birthDate = new Date(`${student.birthDate}T00:00:00Z`);
          const existing = await tx.student.findFirst({
            where: {
              OR: [
                { cpf: student.cpf },
                { schoolRegistration: student.schoolRegistration },
              ],
            },
          });
          if (
            existing &&
            (existing.cpf !== student.cpf ||
              existing.schoolRegistration !== student.schoolRegistration ||
              existing.fullName !== student.fullName ||
              existing.birthDate.getTime() !== birthDate.getTime())
          ) {
            throw new TestEnvironmentError(
              'Colisão com registro diferente da fixture; seed cancelado sem alterações.',
            );
          }
          const record =
            existing ??
            (await tx.student.create({ data: { ...student, birthDate } }));
          // Referência inteiramente fictícia para experimentar o primeiro acesso.
          // Nunca sobrescreve complementos já conferidos da demonstração.
          await tx.studentDetails.upsert({
            where: { studentId: record.id },
            create: {
              studentId: record.id,
              parentOne: 'Filiação Fictícia de Demonstração',
              parentageSource: 'SCHOOL_RECORD',
            },
            update: {},
          });
          const enrollment = await tx.enrollment.findUnique({
            where: { importSourceId: `seed:${student.schoolRegistration}` },
          });
          if (
            enrollment &&
            (enrollment.studentId !== record.id ||
              enrollment.mode !== 'INTEGRADO' ||
              enrollment.className !== '2B DS' ||
              enrollment.grade !== 2 ||
              enrollment.courseLabel !== 'DS')
          )
            throw new TestEnvironmentError(
              'Matrícula de seed difere da fixture esperada.',
            );
          await tx.enrollment.upsert({
            where: { importSourceId: `seed:${student.schoolRegistration}` },
            update: {},
            create: {
              studentId: record.id,
              mode: 'INTEGRADO',
              className: '2B DS',
              grade: 2,
              courseLabel: 'DS',
              importSourceId: `seed:${student.schoolRegistration}`,
            },
          });
        }
        const student = await tx.student.findUniqueOrThrow({
          where: { cpf: students[1].cpf },
        });
        // Reexecutar o seed preserva uma conta que já existe, inclusive sua senha.
        await tx.account.upsert({
          where: { studentId: student.id },
          update: {},
          create: {
            studentId: student.id,
            email: 'aluno.teste@eteconectada.invalid',
            passwordHash,
            status: 'active',
          },
        });
        if (demo) {
          const secretary = await tx.student.findUniqueOrThrow({
            where: { cpf: students[0].cpf },
          });
          const fixtures = [
            {
              studentId: student.id,
              email: 'aluno.teste@eteconectada.invalid',
              role: 'student',
            },
            {
              studentId: secretary.id,
              email: 'secretaria.demo@eteconectada.invalid',
              role: 'secretary',
            },
          ];
          for (const fixture of fixtures) {
            const existing = await tx.account.findFirst({
              where: {
                OR: [
                  { studentId: fixture.studentId },
                  { email: fixture.email },
                ],
              },
            });
            if (
              existing &&
              (existing.studentId !== fixture.studentId ||
                existing.email !== fixture.email ||
                existing.role !== fixture.role ||
                existing.status !== 'active')
            ) {
              throw new TestEnvironmentError(
                'Conta de demonstração difere da fixture; nenhuma senha ou permissão foi alterada.',
              );
            }
            if (!existing)
              await tx.account.create({
                data: { ...fixture, passwordHash, status: 'active' },
              });
          }
        }
      },
      { timeout: 30000 },
    );
    if (demo) {
      const secretary = await db.account.findUniqueOrThrow({
        where: { email: 'secretaria.demo@eteconectada.invalid' },
      });
      for (const student of students) {
        const enrollment = await db.enrollment.findUniqueOrThrow({
          where: { importSourceId: `seed:${student.schoolRegistration}` },
        });
        // Só completa a fixture inicial; não desfaz alterações de situação já conferidas.
        if (!enrollment.reviewedAt && enrollment.status === 'UNCONFIRMED') {
          await reviewEnrollment(db, secretary.id, enrollment.id, {
            status: 'ACTIVE',
            periodLabel: '2026',
            validFrom: '2000-01-01',
            validUntil: '2099-12-31',
          });
        }
      }
    }
    console.log(
      demo
        ? 'Demonstração preparada: aluno e secretaria sintéticos; contas e senhas existentes preservadas.'
        : 'Seed concluído: três alunos sintéticos; contas existentes preservadas.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
