import { config } from 'dotenv';
import { readFile, stat } from 'node:fs/promises';
import { getDb } from '../src/lib/db';
import { parseStudentBackup, StudentImportError } from '../src/lib/student-import';

config({ path: '.env.local', quiet: true });

async function main() {
  const path = process.argv[2];
  if (!path) throw new StudentImportError('Informe o caminho do Backup.alunos.json.');
  if ((await stat(path)).size > 30 * 1024 * 1024) throw new StudentImportError('Arquivo acima do limite de 30 MB.');
  const rows = parseStudentBackup(JSON.parse(await readFile(path, 'utf8')));
  const enableDevelopmentRegistration = process.argv.includes('--enable-development-registration');
  if (enableDevelopmentRegistration && process.env.NODE_ENV === 'production') throw new StudentImportError('A liberação do primeiro acesso está disponível somente para testes de desenvolvimento.');
  const db = getDb();
  try {
    const result = await db.$transaction(async tx => {
      const existing = await tx.student.findMany({
        where: { schoolRegistration: { in: rows.map(r => r.schoolRegistration) } },
        select: { schoolRegistration: true, importSourceId: true },
      });
      const expected = new Map(rows.map(r => [r.schoolRegistration, r.sourceId]));
      if (existing.some(r => r.importSourceId !== expected.get(r.schoolRegistration!))) {
        throw new StudentImportError('Há matrícula vinculada a outro registro. Confira a origem antes de importar.');
      }
      const created = await tx.student.createMany({ skipDuplicates: true, data: rows.map(row => ({
        fullName: row.fullName, birthDate: row.birthDate, schoolRegistration: row.schoolRegistration,
        importSourceId: row.sourceId, registrationAllowed: false,
      })) });
      const students = await tx.student.findMany({ where: { importSourceId: { in: rows.map(r => r.sourceId) } }, select: { id: true, importSourceId: true } });
      if (students.length !== rows.length) throw new StudentImportError('A importação não encontrou todos os registros. Transação cancelada.');
      if (enableDevelopmentRegistration) {
        await tx.student.updateMany({ where: { id: { in: students.map(s => s.id) } }, data: { registrationAllowed: true } });
      }
      const ids = new Map(students.map(s => [s.importSourceId, s.id]));
      const enrollments = await tx.enrollment.createMany({ skipDuplicates: true, data: rows.map(row => ({
        studentId: ids.get(row.sourceId)!, mode: 'INTEGRADO', className: row.className,
        grade: row.grade, courseLabel: row.courseLabel, importSourceId: row.sourceId,
      })) });
      return { studentsCreated: created.count, studentsPreserved: rows.length - created.count, enrollmentsCreated: enrollments.count };
    }, { timeout: 60000 });
    console.log(JSON.stringify({ total: rows.length, ...result, mode: 'INTEGRADO', classes: new Set(rows.map(r => r.className)).size, accountsCreated: 0, developmentRegistrationEnabled: enableDevelopmentRegistration }));
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  // Nunca imprimir objetos Prisma ou linhas do backup: podem conter dados pessoais.
  console.error(error instanceof StudentImportError ? error.message : 'Não foi possível importar. Confira o arquivo, a conexão e as migrações.');
  process.exitCode = 1;
});
