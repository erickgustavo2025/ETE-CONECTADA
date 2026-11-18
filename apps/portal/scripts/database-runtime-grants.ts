import type { ClientBase } from 'pg';
import { portalDatabaseGrants } from '../src/lib/database-runtime-role';

export async function assignPortalDatabaseGrants(
  admin: Pick<ClientBase, 'query'>,
  role: string,
) {
  // Somente identificadores simples, validados antes de chegar a comandos DDL.
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role))
    throw new Error('Papel do portal inválido.');
  const target = '"' + role + '"';
  const result = await admin.query<{ database: string }>(
    `
    SELECT d.datname AS database
    FROM pg_catalog.pg_database d
    JOIN pg_catalog.pg_roles r ON r.rolname = $1
    WHERE d.datname = current_database() AND d.datdba <> r.oid
      AND r.rolname <> current_user AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
               OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid)
  `,
    [role],
  );
  const database = result.rows[0]?.database;
  if (!database)
    throw new Error(
      'Use um papel próprio do portal, sem privilégios de administração.',
    );
  const name = '"' + database.replaceAll('"', '""') + '"';

  await admin.query('BEGIN');
  try {
    await admin.query(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${name} FROM PUBLIC`,
    );
    await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${target}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${target}`);
    for (const [table, verbs] of Object.entries(portalDatabaseGrants))
      await admin.query(
        `GRANT ${verbs.join(', ')} ON TABLE public."${table}" TO ${target}`,
      );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}
