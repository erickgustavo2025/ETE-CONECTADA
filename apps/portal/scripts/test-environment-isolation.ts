import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { createTestDatabaseScenario } from './test-database-scenario';
import {
  openTestEnvironment,
  parseTestEnvironment,
  reportTestFailure,
} from './test-environment';

async function main() {
  const source = parseTestEnvironment(process.env);
  const adminUrl = new URL(source.url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let env: Awaited<ReturnType<typeof openTestEnvironment>> | undefined;
  try {
    env = await openTestEnvironment();
    const [identity] = await env.db.$queryRaw<
      Array<{ database: string }>
    >`SELECT current_database() AS database`;
    assert.notEqual(
      identity.database,
      source.database,
      'O harness deve usar um banco próprio por cenário.',
    );
    assert.equal(
      parseTestEnvironment(process.env).database,
      identity.database,
      'Subprocessos de conferência recebem o cenário, não a fonte.',
    );
    await assert.rejects(openTestEnvironment(), /cenário.*aberto/);
    const student = await env.db.student.create({
      data: {
        birthDate: new Date('2000-01-01'),
        fullName: 'Pessoa fictícia isolamento de jornadas',
      },
    });
    const account = await env.db.account.create({
      data: { studentId: student.id },
    });
    await env.db.studentAccessChange.create({
      data: {
        studentId: student.id,
        createdById: account.id,
        requestKey: crypto.randomUUID(),
        kind: 'LOGIN',
        blocked: true,
        revision: 1,
        reason: 'Histórico sintético conservado até encerrar o cenário',
      },
    });
    assert.equal(await env.db.studentAccessChange.count(), 1);
    await env.close();
    await env.close();
    const closedEnvironment = env;
    env = undefined;
    assert.equal(parseTestEnvironment(process.env).database, source.database);
    assert.equal(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',
          [identity.database],
        )
      ).rows[0].n,
      0,
    );
    env = await openTestEnvironment();
    await closedEnvironment.close();
    assert.equal(
      await env.db.student.count(),
      0,
      'Prisma deve conectar no novo cenário, sem reusar o banco descartado.',
    );
    await env.close();
    env = undefined;
    const original = new Client({ connectionString: source.url });
    await original.connect();
    try {
      assert.equal(
        (await original.query('SELECT count(*)::int AS n FROM students'))
          .rows[0].n,
        0,
      );
    } finally {
      await original.end();
    }
    const checkCleanup = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          fileURLToPath(new URL('./test-cleanup.ts', import.meta.url)),
        ],
        { env: process.env, stdio: 'pipe' },
      ).status;
    const residual = await createTestDatabaseScenario();
    try {
      assert.notEqual(
        checkCleanup(),
        0,
        'A checagem deve recusar um cenário residual, mesmo com a fonte vazia.',
      );
      assert.equal(
        (
          await admin.query(
            'SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',
            [residual.config.database],
          )
        ).rows[0].n,
        1,
        'A checagem é somente leitura e não apaga resíduos.',
      );
    } finally {
      await residual.close();
    }
    assert.equal(
      checkCleanup(),
      0,
      'Sem dados ou bancos residuais, a checagem deve passar.',
    );
    console.log(
      'OK: jornadas usam cenários separados, conservam eventos até descarte e restauram a fonte/configuração para o próximo teste.',
    );
  } finally {
    try {
      if (env) await env.close();
    } finally {
      await admin.end();
    }
  }
}
main().catch(reportTestFailure);
