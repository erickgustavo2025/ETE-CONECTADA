import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { getDb, disconnectDb } from '../src/lib/db';
import { assertPortalDatabaseRole } from '../src/lib/database-runtime-role';
import { assignPortalDatabaseGrants } from './database-runtime-grants';
import { createTestDatabaseScenario } from './test-database-scenario';
import { reportTestFailure } from './test-environment';

async function main() {
  const scenario = await createTestDatabaseScenario();
  const admin = new Client({ connectionString: scenario.config.url });
  const role = 'ete_runtime_' + randomBytes(12).toString('hex');
  const password = randomBytes(32).toString('hex');
  const url = new URL(scenario.config.url);
  url.username = role;
  url.password = password;
  const runtime = new Client({ connectionString: url.toString() });
  let created = false;
  const previousUrl = process.env.DATABASE_URL;
  try {
    await admin.connect();
    await assert.rejects(assertPortalDatabaseRole(admin), /privilégios/);
    process.env.DATABASE_URL = scenario.config.url;
    await assert.rejects(getDb().$queryRaw`SELECT current_user`, /privilégios/);
    await disconnectDb();
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    created = true;
    await assignPortalDatabaseGrants(admin, role);
    await runtime.connect();
    await assertPortalDatabaseRole(runtime);
    process.env.DATABASE_URL = url.toString();
    assert.deepEqual(await getDb().$queryRaw`SELECT current_user AS role`, [
      { role },
    ]);
    await disconnectDb();

    const permissions = await runtime.query(`
      SELECT has_table_privilege('public.student_access_changes','SELECT') AS read,
             has_table_privilege('public.student_access_changes','INSERT') AS append,
             has_any_column_privilege('public.student_access_changes','UPDATE') AS edit,
             has_table_privilege('public.student_access_changes','DELETE, TRUNCATE') AS remove,
             has_table_privilege('public.sessions','DELETE') AS expire_session,
             has_table_privilege('public._prisma_migrations','SELECT') AS migrations
    `);
    assert.deepEqual(permissions.rows[0], {
      read: true,
      append: true,
      edit: false,
      remove: false,
      expire_session: true,
      migrations: false,
    });

    await admin.query(
      `GRANT UPDATE (reason) ON public.student_access_changes TO "${role}"`,
    );
    await assert.rejects(assertPortalDatabaseRole(runtime), /privilégios/);
    await admin.query(
      `REVOKE UPDATE (reason) ON public.student_access_changes FROM "${role}"`,
    );
    await assertPortalDatabaseRole(runtime);

    await admin.query(
      `GRANT SELECT ON public.student_access_changes TO "${role}" WITH GRANT OPTION`,
    );
    await assert.rejects(assertPortalDatabaseRole(runtime), /privilégios/);
    await admin.query(
      `REVOKE GRANT OPTION FOR SELECT ON public.student_access_changes FROM "${role}"`,
    );
    await assertPortalDatabaseRole(runtime);
    console.log(
      'OK: credencial própria do portal lê e acrescenta eventos; edição, exclusão, repasse de acesso e administração são recusados pela política.',
    );
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    try {
      await disconnectDb();
      await runtime.end();
      await admin.end();
      await scenario.close();
    } finally {
      if (created) {
        const maintenanceUrl = new URL(scenario.config.url);
        maintenanceUrl.pathname = '/postgres';
        const maintenance = new Client({
          connectionString: maintenanceUrl.toString(),
        });
        try {
          await maintenance.connect();
          await maintenance.query(`DROP ROLE "${role}"`);
        } finally {
          await maintenance.end();
        }
      }
    }
  }
}
main().catch(reportTestFailure);
