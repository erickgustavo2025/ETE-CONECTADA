import {
  parseTestEnvironment,
  reportTestFailure,
  TestEnvironmentError,
  verifyTestDatabase,
} from './test-environment';
import { openMaintenanceDatabase } from './database-maintenance';

const turma = 'Turma DevOps';
const students = [
  [
    '9900301',
    '99999030106',
    '2008-01-15',
    'Lia Martins Prado',
    'Clara Martins Prado',
  ],
  [
    '9900302',
    '99999030297',
    '2008-02-21',
    'Davi Coelho Reis',
    'Renato Coelho Reis',
  ],
  [
    '9900303',
    '99999030378',
    '2008-03-09',
    'Nina Freitas Lobo',
    'Marta Freitas Lobo',
  ],
  [
    '9900304',
    '99999030459',
    '2008-04-17',
    'Theo Pires Neves',
    'Paulo Pires Neves',
  ],
  [
    '9900305',
    '99999030530',
    '2008-05-28',
    'Eva Nunes Paiva',
    'Lúcia Nunes Paiva',
  ],
  [
    '9900306',
    '99999030610',
    '2008-06-06',
    'Ivo Barros Mota',
    'César Barros Mota',
  ],
  [
    '9900307',
    '99999030700',
    '2008-07-24',
    'Luna Leal Torres',
    'Beatriz Leal Torres',
  ],
  [
    '9900308',
    '99999030882',
    '2008-08-13',
    'Ravi Vale Castro',
    'Daniel Vale Castro',
  ],
  [
    '9900309',
    '99999030963',
    '2008-09-30',
    'Mila Duarte Lima',
    'Ana Duarte Lima',
  ],
  [
    '9900310',
    '99999031005',
    '2008-10-11',
    'Noé Rocha Melo',
    'Bruno Rocha Melo',
  ],
] as const;

async function main() {
  const expected = parseTestEnvironment(process.env);
  await verifyTestDatabase(expected);
  const db = openMaintenanceDatabase(expected.url);
  try {
    await db.$transaction(
      async (tx) => {
        for (const [
          schoolRegistration,
          cpf,
          birth,
          fullName,
          parentOne,
        ] of students) {
          const importSourceId = `demo:devops:${schoolRegistration}`;
          const birthDate = new Date(`${birth}T00:00:00Z`);
          const existing = await tx.student.findUnique({
            where: { schoolRegistration },
            include: {
              details: true,
              enrollments: { where: { importSourceId } },
            },
          });
          if (existing) {
            if (
              existing.importSourceId !== importSourceId ||
              existing.cpf !== cpf ||
              existing.fullName !== fullName ||
              existing.birthDate.getTime() !== birthDate.getTime() ||
              existing.details?.parentOne !== parentOne ||
              existing.details.parentageSource !== 'SCHOOL_RECORD' ||
              existing.enrollments.length !== 1
            )
              throw new TestEnvironmentError(
                'Há um cadastro diferente da fixture. A turma foi cancelada sem alterações.',
              );
            continue;
          }
          await tx.student.create({
            data: {
              schoolRegistration,
              importSourceId,
              cpf,
              fullName,
              birthDate,
              registrationAllowed: true,
              details: {
                create: { parentOne, parentageSource: 'SCHOOL_RECORD' },
              },
              enrollments: {
                create: {
                  importSourceId,
                  mode: 'INTEGRADO',
                  className: turma,
                  courseLabel: 'DS',
                  grade: 2,
                  status: 'ACTIVE',
                  periodLabel: '2026',
                  validFrom: new Date('2026-01-01T00:00:00Z'),
                  validUntil: new Date('2099-12-31T00:00:00Z'),
                  reviewedAt: new Date(),
                },
              },
            },
          });
        }
      },
      { timeout: 30_000 },
    );
    console.log('Turma DevOps preparada com 10 matrículas sintéticas.');
  } finally {
    await db.$disconnect();
  }
}

main().catch(reportTestFailure);
