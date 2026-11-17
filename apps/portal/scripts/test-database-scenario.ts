import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  assertDatabaseIdentity,
  parseTestEnvironment,
  TestEnvironmentError,
} from './test-environment';

type Configuration = ReturnType<typeof parseTestEnvironment>;
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const connect = (url: string) =>
  new Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    query_timeout: 7000,
    options: '-c statement_timeout=5000 -c lock_timeout=2000',
  });

async function assertEmptySource(config: Configuration) {
  const client = connect(config.url);
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(
      "SELECT current_database() AS database, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    assertDatabaseIdentity(identity.rows[0], config);
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','portal_schema_migrations','access_throttle_state') ORDER BY tablename",
    );
    if (!tables.rows.some((row) => row.tablename === 'students'))
      throw new TestEnvironmentError(
        'Migre a fonte vazia antes de criar cenários.',
      );
    for (const { tablename } of tables.rows) {
      const result = await client.query(
        `SELECT EXISTS(SELECT 1 FROM public.${quote(tablename)}) AS present`,
      );
      if (result.rows[0].present)
        throw new TestEnvironmentError(
          'A fonte de cenários deve estar vazia; dados existentes foram preservados.',
        );
    }
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

// Apenas harness: exige fonte sintética vazia identificada. Nunca é importado pelo portal.
// Cada cenário conserva os eventos; descarta o banco inteiro após fechar seus clientes.
export async function createTestDatabaseScenario() {
  const source = parseTestEnvironment(process.env);
  await assertEmptySource(source);
  const identity = randomUUID();
  const database = `ete_test_case_${source.identity.slice(0, 8)}_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(source.url);
  adminUrl.pathname = '/postgres';
  const url = new URL(source.url);
  url.pathname = '/' + database;
  const config = { url: url.toString(), database, identity };
  let oid: string | undefined;
  let owner: string | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed) return Promise.resolve();
    closing ??= (async () => {
      const client = connect(adminUrl.toString());
      try {
        await client.connect();
        const result = await client.query<{
          oid: string;
          owner: string;
          marker: string | null;
        }>(
          "SELECT oid::text,datdba::text AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
          [database],
        );
        const row = result.rows[0];
        if (
          !oid ||
          !owner ||
          !row ||
          row.oid !== oid ||
          row.owner !== owner ||
          row.marker !== `ETE_CONECTADA_TEST:${identity}`
        )
          throw new TestEnvironmentError(
            'Identidade do cenário alterada; descarte recusado.',
          );
        const connections = await client.query(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1) AS present',
          [database],
        );
        if (connections.rows[0].present)
          throw new TestEnvironmentError(
            'Feche as conexões do cenário antes do descarte.',
          );
        // Sem FORCE e sem matar sessões: conexões ainda abertas fazem o descarte falhar.
        await client.query(`DROP DATABASE ${quote(database)}`);
        closed = true;
      } finally {
        await client.end();
      }
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  const admin = connect(adminUrl.toString());
  try {
    await admin.connect();
    const sourceRow = await admin.query(
      "SELECT oid,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [source.database],
    );
    assertDatabaseIdentity(
      { database: source.database, marker: sourceRow.rows[0]?.marker },
      source,
    );
    await admin.query(
      `CREATE DATABASE ${quote(database)} TEMPLATE ${quote(source.database)}`,
    );
    await admin.query(
      `COMMENT ON DATABASE ${quote(database)} IS 'ETE_CONECTADA_TEST:${identity}'`,
    );
    const result = await admin.query<{ oid: string; owner: string }>(
      'SELECT oid::text,datdba::text AS owner FROM pg_database WHERE datname=$1',
      [database],
    );
    oid = result.rows[0]?.oid;
    owner = result.rows[0]?.owner;
    // Também recusa dados que entrem na fonte entre a conferência e a cópia.
    await assertEmptySource(config);
    return { config, close };
  } catch (error) {
    if (oid && owner) await close();
    if (error instanceof TestEnvironmentError) throw error;
    throw new TestEnvironmentError(
      'Não foi possível criar o cenário isolado; confira a fonte e suas conexões.',
    );
  } finally {
    await admin.end();
  }
}
