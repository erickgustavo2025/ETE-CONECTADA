import assert from 'node:assert/strict';
import { Client } from 'pg';
import { createTestDatabaseScenario } from './test-database-scenario';
import { parseTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const source = parseTestEnvironment(process.env);
  const adminUrl = new URL(source.url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let scenario:
    Awaited<ReturnType<typeof createTestDatabaseScenario>> | undefined;
  let client: Client | undefined;
  try {
    scenario = await createTestDatabaseScenario();
    const childName = scenario.config.database;
    assert.notEqual(childName, source.database);
    assert.notEqual(scenario.config.identity, source.identity);
    client = new Client({ connectionString: scenario.config.url });
    await client.connect();
    assert.equal(
      (await client.query('SELECT current_database() AS name')).rows[0].name,
      childName,
    );
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM students')).rows[0].n,
      0,
    );
    assert.ok(
      (await client.query('SELECT count(*)::int AS n FROM _prisma_migrations'))
        .rows[0].n > 0,
    );
    const student = (
      await client.query(
        "INSERT INTO students(birth_date,full_name) VALUES('2000-01-01','Pessoa fictícia cenário isolado') RETURNING id",
      )
    ).rows[0].id;
    const account = (
      await client.query(
        'INSERT INTO accounts(student_id) VALUES($1) RETURNING id',
        [student],
      )
    ).rows[0].id;
    await client.query(
      "INSERT INTO student_access_changes(student_id,created_by_id,request_key,kind,blocked,reason,revision) VALUES($1,$2,gen_random_uuid(),'LOGIN',true,'Bloqueio fictício preservado até descartar o banco',1)",
      [student, account],
    );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM student_access_changes',
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      scenario.close(),
      /Feche as conexões/,
      'Não encerra sessões ainda abertas para forçar o descarte.',
    );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM student_access_changes',
        )
      ).rows[0].n,
      1,
    );
    await client.query(
      `COMMENT ON DATABASE "${childName}" IS 'MARCADOR_FICTICIO_DIVERGENTE'`,
    );
    try {
      await assert.rejects(scenario.close(), /Identidade do cenário alterada/);
    } finally {
      await client.query(
        `COMMENT ON DATABASE "${childName}" IS 'ETE_CONECTADA_TEST:${scenario.config.identity}'`,
      );
    }
    const sourceClient = new Client({ connectionString: source.url });
    await sourceClient.connect();
    try {
      assert.equal(
        (await sourceClient.query('SELECT count(*)::int AS n FROM students'))
          .rows[0].n,
        0,
        'A fonte não recebe fixtures do cenário.',
      );
    } finally {
      await sourceClient.end();
    }
    await client.end();
    client = undefined;
    await scenario.close();
    assert.equal(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',
          [childName],
        )
      ).rows[0].n,
      0,
    );
    await scenario.close();
    scenario = await createTestDatabaseScenario();
    assert.notEqual(scenario.config.database, childName);
    client = new Client({ connectionString: scenario.config.url });
    await client.connect();
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM student_access_changes',
        )
      ).rows[0].n,
      0,
      'O próximo cenário não herda histórico sintético.',
    );
    await client.end();
    client = undefined;
    await scenario.close();
    scenario = undefined;
    const previousIdentity = process.env.TEST_DATABASE_ID;
    process.env.TEST_DATABASE_ID = '00000000-0000-0000-0000-000000000000';
    try {
      await assert.rejects(
        createTestDatabaseScenario(),
        /Banco não identificado/,
      );
    } finally {
      process.env.TEST_DATABASE_ID = previousIdentity;
    }
    const sourceClient2 = new Client({ connectionString: source.url });
    await sourceClient2.connect();
    let dirtyStudent: string | undefined;
    try {
      dirtyStudent = (
        await sourceClient2.query(
          "INSERT INTO students(birth_date) VALUES('2000-01-01') RETURNING id",
        )
      ).rows[0].id;
      await assert.rejects(
        createTestDatabaseScenario(),
        /fonte de cenários deve estar vazia/,
      );
      assert.equal(
        (
          await sourceClient2.query(
            'SELECT count(*)::int AS n FROM students WHERE id=$1',
            [dirtyStudent],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      if (dirtyStudent)
        await sourceClient2.query('DELETE FROM students WHERE id=$1', [
          dirtyStudent,
        ]);
      await sourceClient2.end();
    }
    assert.equal(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE $1',
          [`ete_test_case_${source.identity.slice(0, 8)}_%`],
        )
      ).rows[0].n,
      0,
    );
    console.log(
      'OK: bancos de cenário distintos, schema copiado, histórico preservado até descarte, fonte intacta e fechamento repetido seguro.',
    );
  } finally {
    if (client) await client.end();
    try {
      if (scenario) await scenario.close();
    } finally {
      await admin.end();
    }
  }
}
main().catch(reportTestFailure);
