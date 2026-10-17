import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { openTestEnvironment, reportTestFailure } from './test-environment';

const exec = promisify(execFile);

async function main() {
  // A identidade do banco é conferida antes de criar arquivos, subprocessos ou fixtures.
  const environment = await openTestEnvironment();
  const { db } = environment;
  const sources: string[] = [];
  const registrations = new Set<string>();
  let directory: string | undefined;
  let constraintCreated = false;
  const constraint = `test_import_${randomBytes(12).toString('hex')}`;
  const fixture = (name: string, turma = '1A DS') => {
    let matricula: string;
    do {
      matricula = String(randomInt(10000000, 99999999));
    } while (registrations.has(matricula));
    registrations.add(matricula);
    const oid = randomBytes(12).toString('hex');
    sources.push(`backup-alunos:${oid}`);
    return {
      _id: { $oid: oid },
      matricula,
      nome: name,
      dataNascimento: '15/01/2008',
      turma,
      // Dados legados devem ser descartados, mesmo quando pedem privilégios.
      email: 'nao-importar@eteconectada.invalid',
      senha: 'NAO-IMPORTAR',
      passwordHash: 'NAO-IMPORTAR',
      role: 'secretary',
      status: 'active',
      foto: 'https://example.invalid/foto',
      cpf: '00000000000',
      registrationAllowed: true,
      gamificacao: { pontos: 999 },
    };
  };
  const owned = () => ({ importSourceId: { in: sources } });
  const snapshot = () =>
    db.student.findMany({
      where: owned(),
      orderBy: { importSourceId: 'asc' },
      include: {
        account: true,
        enrollments: { orderBy: { importSourceId: 'asc' } },
      },
    });
  async function importRows(
    rows: unknown,
    flags: string[] = [],
    nodeEnv = process.env.NODE_ENV,
  ) {
    const path = join(directory!, 'backup-sintetico.json');
    await writeFile(path, JSON.stringify(rows), { mode: 0o600 });
    try {
      const result = await exec(
        process.execPath,
        ['--import', 'tsx', 'scripts/import-students.ts', path, ...flags],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: {
            ...process.env,
            NODE_ENV: nodeEnv,
            RESEND_API_KEY: '',
            EMAIL_FROM: '',
          },
          timeout: 65000,
          maxBuffer: 64 * 1024,
        },
      );
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const result = error as {
        code?: unknown;
        stdout?: string;
        stderr?: string;
      };
      if (result.code !== 1)
        throw new Error('O importador não encerrou como esperado.', {
          cause: error,
        });
      return {
        code: 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    }
  }
  try {
    directory = await mkdtemp(join(tmpdir(), 'ete-student-import-test-'));
    const archivedPhotos = await db.$queryRawUnsafe(
      'SELECT count(*) FROM retired_profile_photos',
    );
    const first = fixture('Aluno sintético A');
    first.matricula = `0${randomInt(10000, 99999)}`;
    registrations.add(first.matricula);
    const second = fixture('Aluno sintético B', '2B ADM');
    const rows = [first, second];
    const initial = await importRows(rows);
    assert.equal(initial.code, 0, 'Importação inicial deve funcionar');
    assert.deepEqual(JSON.parse(initial.stdout), {
      total: 2,
      studentsCreated: 2,
      studentsPreserved: 0,
      enrollmentsCreated: 2,
      mode: 'INTEGRADO',
      classes: 2,
      accountsCreated: 0,
      developmentRegistrationEnabled: false,
    });
    const imported = await snapshot();
    assert.equal(imported.length, 2);
    for (const student of imported) {
      const row = rows.find(
        (r) => `backup-alunos:${r._id.$oid}` === student.importSourceId,
      )!;
      assert.equal(student.schoolRegistration, row.matricula);
      assert.equal(student.fullName, row.nome);
      assert.equal(student.birthDate.toISOString(), '2008-01-15T00:00:00.000Z');
      assert.equal(student.cpf, null);
      assert.equal(
        student.registrationAllowed,
        false,
        'Legado não libera acesso',
      );
      assert.equal(
        student.account,
        null,
        'Legado não cria conta, senha, e-mail ou papel',
      );
      assert.equal(student.enrollments.length, 1);
      const enrollment = student.enrollments[0];
      assert.equal(enrollment.studentId, student.id);
      assert.equal(enrollment.importSourceId, student.importSourceId);
      assert.equal(enrollment.mode, 'INTEGRADO');
      assert.equal(enrollment.className, row.turma);
      assert.equal(enrollment.grade, Number(row.turma[0]));
      assert.equal(enrollment.courseLabel, row.turma.split(' ')[1]);
      assert.equal(enrollment.schoolYear, null);
    }
    const repeat = await importRows(rows);
    assert.equal(repeat.code, 0);
    assert.equal(JSON.parse(repeat.stdout).studentsCreated, 0);
    assert.equal(JSON.parse(repeat.stdout).enrollmentsCreated, 0);
    assert.deepEqual(
      await snapshot(),
      imported,
      'Repetição preserva IDs e dados sem duplicar',
    );

    // Alterações locais e conta existente não são substituídas pelo backup antigo.
    const firstId = imported.find(
      (s) => s.schoolRegistration === first.matricula,
    )!.id;
    await db.student.update({
      where: { id: firstId },
      data: { fullName: 'Nome sintético conferido' },
    });
    await db.account.create({
      data: {
        studentId: firstId,
        email: `import-${randomBytes(8).toString('hex')}@eteconectada.invalid`,
        passwordHash: 'hash-sintetico-preservado',
        role: 'student',
        status: 'active',
      },
    });
    const preserved = await snapshot();
    assert.equal((await importRows(rows)).code, 0);
    assert.deepEqual(
      await snapshot(),
      preserved,
      'Não atualiza estudante nem credenciais existentes',
    );

    const newStudent = fixture('Aluno sintético C');
    const otherSource = fixture('Fonte sintética divergente');
    const registrationConflict = await importRows([
      newStudent,
      { ...first, _id: otherSource._id },
    ]);
    assert.equal(
      registrationConflict.code,
      1,
      'Matrícula não pode mudar de origem',
    );
    assert.deepEqual(
      await snapshot(),
      preserved,
      'Conflito não deixa o aluno novo',
    );

    const otherRegistration = fixture('Matrícula sintética divergente');
    const sourceConflict = await importRows(
      [newStudent, { ...first, matricula: otherRegistration.matricula }],
      ['--enable-development-registration'],
    );
    assert.equal(sourceConflict.code, 1, 'Origem não pode mudar de matrícula');
    assert.deepEqual(
      await snapshot(),
      preserved,
      'Conflito de origem cancela o lote inteiro',
    );

    // A chave da matrícula também não pode pertencer a outro aluno.
    const conflictingEnrollment = await db.enrollment.create({
      data: {
        studentId: firstId,
        mode: 'INTEGRADO',
        className: '1A DS',
        grade: 1,
        courseLabel: 'DS',
        importSourceId: `backup-alunos:${newStudent._id.$oid}`,
      },
    });
    try {
      const beforeConflict = await snapshot();
      const enrollmentConflict = await importRows(
        [newStudent],
        ['--enable-development-registration'],
      );
      assert.equal(
        enrollmentConflict.code,
        1,
        'Matrícula de curso não pode apontar para outro aluno',
      );
      assert.deepEqual(
        await snapshot(),
        beforeConflict,
        'Conflito de matrícula desfaz aluno e liberação',
      );
    } finally {
      await db.enrollment.delete({ where: { id: conflictingEnrollment.id } });
    }

    const duplicate = await importRows([newStudent, newStudent]);
    assert.equal(duplicate.code, 1, 'Duplicata dentro do arquivo é recusada');
    assert.deepEqual(await snapshot(), preserved);
    const invalid = await importRows([
      newStudent,
      { ...second, dataNascimento: '31/02/2008' },
    ]);
    assert.equal(
      invalid.code,
      1,
      'Data inválida recusa o lote antes de importar',
    );
    assert.deepEqual(await snapshot(), preserved);

    const production = await importRows(
      [newStudent],
      ['--enable-development-registration'],
      'production',
    );
    assert.equal(
      production.code,
      1,
      'Opt-in de desenvolvimento é recusado em produção',
    );
    assert.deepEqual(await snapshot(), preserved);

    // Falha no INSERT de matrícula depois do INSERT de aluno prova atomicidade real.
    // Nome e valor SQL são gerados aqui; nunca vêm de entrada externa.
    const failedSource = `backup-alunos:${newStudent._id.$oid}`;
    await db.$executeRawUnsafe(
      `ALTER TABLE enrollments ADD CONSTRAINT ${constraint} CHECK (import_source_id IS DISTINCT FROM '${failedSource}') NOT VALID`,
    );
    constraintCreated = true;
    try {
      const failed = await importRows([newStudent]);
      assert.equal(
        failed.code,
        1,
        'Falha de matrícula deve reprovar o importador',
      );
      assert.deepEqual(
        await snapshot(),
        preserved,
        'Rollback remove aluno criado antes da falha',
      );
      assert.equal(failed.stdout, '', 'Falha não publica resumo de sucesso');
      assert.equal(
        failed.stderr.trim(),
        'Não foi possível importar. Confira o arquivo, a conexão e as migrações.',
      );
    } finally {
      await db.$executeRawUnsafe(
        `ALTER TABLE enrollments DROP CONSTRAINT ${constraint}`,
      );
      constraintCreated = false;
    }

    const enabled = await importRows(
      [newStudent],
      ['--enable-development-registration'],
    );
    assert.equal(enabled.code, 0);
    assert.equal(
      JSON.parse(enabled.stdout).developmentRegistrationEnabled,
      true,
    );
    const allowed = await db.student.findUniqueOrThrow({
      where: { importSourceId: failedSource },
      include: { account: true },
    });
    assert.equal(
      allowed.registrationAllowed,
      true,
      'Somente opt-in explícito libera desenvolvimento',
    );
    assert.equal(allowed.account, null);
    const afterEnabled = await snapshot();
    assert.deepEqual(
      afterEnabled.filter((s) => s.importSourceId !== failedSource),
      preserved,
      'Opt-in não altera alunos fora do lote',
    );
    assert.equal((await importRows([newStudent])).code, 0);
    assert.deepEqual(
      await snapshot(),
      afterEnabled,
      'Reimportação padrão preserva liberação já autorizada',
    );
    assert.deepEqual(
      await db.$queryRawUnsafe('SELECT count(*) FROM retired_profile_photos'),
      archivedPhotos,
      'Backup não cria fotos arquivadas',
    );
    console.log(
      'OK: importação JSON, lista branca, bloqueio padrão, idempotência, preservação, conflitos e rollback após escrita.',
    );
  } finally {
    try {
      if (constraintCreated)
        await db.$executeRawUnsafe(
          `ALTER TABLE enrollments DROP CONSTRAINT ${constraint}`,
        );
      await db.student.deleteMany({ where: owned() });
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true });
      } finally {
        await environment.close();
      }
    }
  }
}
main().catch(reportTestFailure);
