import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { assignPortalDatabaseGrants } from './database-runtime-grants';
import { assertPortalDatabaseRole } from '../src/lib/database-runtime-role';
import { TestEnvironmentError, verifyTestDatabase } from './test-environment';

export async function createTestDatabaseRuntime(config: {
  url: string;
  database: string;
  identity: string;
}) {
  await verifyTestDatabase(config);
  if (!/^ete_test_case_[a-f0-9]{8}_[a-f0-9]{32}$/.test(config.database))
    throw new TestEnvironmentError(
      'O papel de teste exige um banco de cenário próprio.',
    );
  const role = config.database.replace('ete_test_case_', 'ete_test_role_');
  const password = randomBytes(32).toString('hex');
  const url = new URL(config.url);
  url.username = role;
  url.password = password;

  const drop = async () => {
    const maintenance = new URL(config.url);
    maintenance.pathname = '/postgres';
    const admin = new Client({
      connectionString: maintenance.toString(),
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await admin.connect();
      await admin.query(`DROP ROLE "${role}"`);
    } finally {
      await admin.end();
    }
  };

  const admin = new Client({
    connectionString: config.url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  let created = false;
  try {
    await admin.connect();
    // Nome derivado de UUID e senha hexadecimal aleatória, exclusivos deste cenário.
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    created = true;
    await assignPortalDatabaseGrants(admin, role);
    const runtime = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await runtime.connect();
      await assertPortalDatabaseRole(runtime);
    } finally {
      await runtime.end();
    }
    return { url: url.toString(), drop };
  } catch {
    // As concessões pertencem ao cenário e somem quando seu banco é descartado.
    // O chamador precisa poder descartar o papel mesmo quando o provisionamento falha.
    return { url: '', drop: created ? drop : async () => {} };
  } finally {
    await admin.end();
  }
}
