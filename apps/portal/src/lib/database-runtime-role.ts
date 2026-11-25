import type { ClientBase } from 'pg';

const append = ['SELECT', 'INSERT'] as const;
const mutable = [...append, 'UPDATE'] as const;
const temporary = [...mutable, 'DELETE'] as const;

// Tabelas novas exigem uma decisão explícita. O papel do portal não é dono do schema.
export const portalDatabaseGrants = {
  students: mutable,
  student_details: mutable,
  enrollments: mutable,
  accounts: mutable,
  account_security_events: append,
  staff_access_events: ['SELECT'] as const,
  account_email_changes: temporary,
  student_access_changes: append,
  password_reset_tokens: temporary,
  sessions: temporary,
  email_verification_tokens: temporary,
  declaration_requests: mutable,
  sheet_import_previews: temporary,
  enrollment_import_history: append,
  course_offerings: mutable,
  course_calendar_versions: append,
  access_throttle_state: mutable,
  access_attempt_buckets: temporary,
  declaration_documents: append,
  declaration_pdf_archives: append,
  declaration_current_issues: mutable,
  declaration_document_actions: append,
  school_academic_events: append,
} as const;

export async function assertPortalDatabaseRole(
  client: Pick<ClientBase, 'query'>,
) {
  // Checa também privilégios por coluna: um GRANT UPDATE(coluna) não
  // aparece como permissão de atualização da tabela inteira.
  const result = await client.query<{ allowed: boolean }>(
    `
    WITH expected AS (
      SELECT relation, verbs
      FROM pg_catalog.jsonb_each($1::jsonb) AS t(relation, verbs)
    ), relations AS (
      SELECT c.oid, c.relname, c.relowner, c.relkind
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')
    )
    SELECT current_user = session_user
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
               OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
                      WHERE m.member = r.oid)
      AND d.datdba <> r.oid
      AND NOT pg_catalog.has_database_privilege(d.oid, 'CREATE, TEMP, CONNECT WITH GRANT OPTION')
      AND pg_catalog.has_schema_privilege('public', 'USAGE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n
        WHERE (n.nspowner = r.oid OR pg_catalog.has_schema_privilege(n.oid, 'CREATE, USAGE WITH GRANT OPTION'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected e LEFT JOIN relations t ON t.relname = e.relation
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(e.verbs) AS permitted(verb)
        WHERE t.oid IS NULL OR t.relkind NOT IN ('r','p')
          OR NOT pg_catalog.has_table_privilege(t.oid, permitted.verb)
      )
      AND NOT EXISTS (
        SELECT 1 FROM relations t LEFT JOIN expected e ON e.relation = t.relname
        WHERE t.relowner = r.oid OR CASE WHEN t.relkind = 'S' THEN
          pg_catalog.has_sequence_privilege(t.oid, 'USAGE, SELECT, UPDATE')
        ELSE
          pg_catalog.has_table_privilege(t.oid, 'TRUNCATE, TRIGGER')
          OR pg_catalog.has_table_privilege(t.oid, 'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, DELETE WITH GRANT OPTION')
          OR pg_catalog.has_any_column_privilege(t.oid, 'REFERENCES, SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION')
          OR EXISTS (
            SELECT 1
            FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS privilege(verb)
            WHERE NOT COALESCE(e.verbs ? privilege.verb, false)
              AND pg_catalog.has_any_column_privilege(t.oid, privilege.verb)
          )
          OR (NOT COALESCE(e.verbs ? 'DELETE', false)
              AND pg_catalog.has_table_privilege(t.oid, 'DELETE'))
        END
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND (p.proowner = r.oid OR (p.prosecdef AND pg_catalog.has_function_privilege(p.oid, 'EXECUTE')))
      ) AS allowed
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_database d
    WHERE r.rolname = current_user AND d.datname = current_database()
  `,
    [JSON.stringify(portalDatabaseGrants)],
  );
  if (result.rows[0]?.allowed !== true)
    throw new Error(
      'A credencial do portal não atende à política de privilégios do banco.',
    );
}
