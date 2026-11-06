import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import {
  assertDatabaseIdentity,
  parseTestEnvironment,
  reportTestFailure,
} from './test-environment';

// Contrato do banco migrado, incluindo arquivo histórico e regras fora do Prisma.
const columns: Record<string, string> = {
  declaration_document_actions:
    'document_id student_id enrollment_id action reason successor_id created_by_id created_at',
  access_throttle_state: 'id key_material last_sweep_at',
  access_attempt_buckets: 'key used window_started_at expires_at',
  students:
    'id cpf birth_date created_at full_name school_registration import_source_id registration_allowed',
  student_details:
    'student_id parent_one parent_two parentage_source social_name social_name_source birth_city birth_state birth_country birthplace_source updated_at updated_by_id',
  accounts:
    'id student_id email password_hash status created_at updated_at role password_reset_at',
  password_reset_tokens:
    'token_hash account_id credential_hash expires_at created_at',
  email_verification_tokens:
    'token_hash account_id expires_at consumed_at created_at claim_data_hash',
  sessions: 'token_hash account_id expires_at created_at',
  enrollments:
    'id student_id mode class_name grade course_label school_year import_source_id created_at status period_label valid_from valid_until reviewed_at reviewed_by_id school_import_key module_number offering_id calendar_module calendar_revision progression_held',
  enrollment_import_history:
    'id enrollment_id recorded_at recorded_by_id reason mode class_name grade module_number course_label school_year period_label valid_from valid_until status reviewed_at offering_id calendar_revision progression_held',
  course_offerings:
    'id label course_label created_at last_import_at last_import_module last_import_period',
  course_calendar_versions:
    'id offering_id revision schedule created_at created_by_id',
  sheet_import_previews:
    'actor_id token_hash input_hash snapshot_hash expires_at consumed_at result',
  declaration_current_issues:
    'enrollment_id document_type student_id document_id',
  declaration_pdf_archives:
    'sha256 bytes page_count template_version created_at',
  declaration_documents:
    'id public_code student_id enrollment_id created_by_id created_at status snapshot_version snapshot source_pdf_sha256 source_pdf_page archive_sha256 origin request_key',
  declaration_requests:
    'id student_id enrollment_id status created_at generated_at ready_at prepared_by_id ready_by_id document_id',
  portal_schema_migrations: 'version applied_at',
  retired_profile_photos:
    'student_id photo_data mime_type updated_at object_key storage_bucket',
};

async function main() {
  const expected = parseTestEnvironment(process.env);
  const client = new Client({
    connectionString: expected.url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const identity = await client.query(
      "SELECT current_database() AS database, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    );
    assertDatabaseIdentity(identity.rows[0], expected);
    // Somente leitura após conferir a identidade; não gera Prisma nem inicia portal.
    await client.query('BEGIN READ ONLY');
    const actual = await client.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      udt_name: string;
      column_default: string | null;
    }>(
      "SELECT table_name, column_name, is_nullable, udt_name, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name",
    );
    assert.deepEqual(
      [...new Set(actual.rows.map((row) => row.table_name))].sort(),
      [...Object.keys(columns), '_prisma_migrations'].sort(),
    );
    for (const [table, names] of Object.entries(columns)) {
      assert.deepEqual(
        actual.rows
          .filter((row) => row.table_name === table)
          .map((row) => row.column_name)
          .sort(),
        names.split(' ').sort(),
        `Colunas de ${table}`,
      );
    }
    const state = await client.query<{ valid: boolean }>(
      "SELECT count(*) = 1 AND bool_and(id = 1 AND key_material ~ '^[0-9a-f]{64}$') AS valid FROM access_throttle_state",
    );
    assert.equal(
      state.rows[0].valid,
      true,
      'Estado técnico de tentativas deve existir sem expor sua chave.',
    );
    const column = (table: string, name: string) =>
      actual.rows.find(
        (row) => row.table_name === table && row.column_name === name,
      )!;
    assert.equal(column('students', 'cpf').is_nullable, 'YES');
    assert.equal(column('accounts', 'password_reset_at').is_nullable, 'YES');
    assert.equal(
      column('password_reset_tokens', 'token_hash').udt_name,
      'bpchar',
    );
    assert.equal(
      column('email_verification_tokens', 'claim_data_hash').is_nullable,
      'YES',
    );
    assert.equal(
      column('email_verification_tokens', 'claim_data_hash').udt_name,
      'bpchar',
    );
    assert.equal(column('students', 'cpf').udt_name, 'bpchar');
    assert.equal(column('students', 'birth_date').udt_name, 'date');
    assert.equal(column('students', 'registration_allowed').is_nullable, 'NO');
    assert.equal(
      column('students', 'registration_allowed').column_default,
      'true',
    );
    assert.equal(column('accounts', 'role').column_default, "'student'::text");
    assert.equal(
      column('declaration_requests', 'status').udt_name,
      'DeclarationRequestStatus',
    );
    assert.equal(column('enrollments', 'mode').udt_name, 'EducationMode');

    const enums = await client.query<{ name: string; values: string[] }>(
      "SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname",
    );
    assert.deepEqual(enums.rows, [
      {
        name: 'DeclarationRequestStatus',
        values: [
          'REQUESTED',
          'IN_PREPARATION',
          'READY_FOR_PICKUP',
          'AVAILABLE',
        ],
      },
      { name: 'EducationMode', values: ['INTEGRADO', 'SUBSEQUENTE'] },
      { name: 'EnrollmentStatus', values: ['UNCONFIRMED', 'ACTIVE', 'ENDED'] },
      {
        name: 'StudentDataSource',
        values: [
          'SCHOOL_RECORD',
          'STUDENT_DECLARATION',
          'SECRETARY_CORRECTION',
        ],
      },
    ]);
    const constraints = await client.query<{
      table_name: string;
      name: string;
      definition: string;
    }>(
      "SELECT r.relname AS table_name, c.conname AS name, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public'",
    );
    const constraint = (name: string) => {
      const found = constraints.rows.find((row) => row.name === name);
      assert.ok(found, `Constraint obrigatória: ${name}`);
      return found.definition;
    };
    assert.match(constraint('students_cpf_check'), /\^\[0-9\]\{11\}\$/);
    assert.match(constraint('accounts_role_check'), /student.*secretary/);
    assert.match(
      constraint('accounts_status_check'),
      /unclaimed.*pending.*active/,
    );
    assert.match(constraint('accounts_check'), /password_hash IS NOT NULL/);
    assert.match(
      constraint('student_details_parentage_check'),
      /parentage_source.*STUDENT_DECLARATION/,
    );
    assert.match(
      constraint('enrollments_active_check'),
      /ACTIVE.*reviewed_at IS NOT NULL/,
    );
    assert.match(
      constraint('enrollment_import_history_reason_check'),
      /METADATA_CHANGE.*IDENTITY_REVIEW/,
    );
    assert.match(
      constraint('enrollments_module_number_check'),
      /module_number/,
    );
    assert.match(
      constraint('email_verification_claim_hash_check'),
      /claim_data_hash.*\[0-9a-f\]/,
    );
    assert.match(
      constraint('enrollments_validity_check'),
      /valid_from <= valid_until/,
    );
    assert.match(
      constraint('student_details_birthplace_check'),
      /birth_country.*birth_state/,
    );
    assert.match(
      constraint('declaration_requests_dates_check'),
      /REQUESTED.*generated_at IS NULL.*IN_PREPARATION.*READY_FOR_PICKUP.*ready_at IS NOT NULL.*AVAILABLE.*document_id IS NOT NULL/,
    );
    assert.match(
      constraint('access_attempt_dates_check'),
      /expires_at > window_started_at/,
    );
    assert.match(
      constraint('access_attempt_buckets_used_check'),
      /used >= 1.*used <= 600/,
    );
    assert.match(
      constraint('password_reset_dates_check'),
      /expires_at > created_at/,
    );
    assert.match(
      constraint('password_reset_tokens_token_hash_check'),
      /token_hash.*\[0-9a-f\]/,
    );
    assert.match(
      constraint('password_reset_tokens_credential_hash_check'),
      /credential_hash.*\[0-9a-f\]/,
    );
    assert.match(
      constraint('enrollments_calendar_check'),
      /SUBSEQUENTE.*calendar_module IS NOT NULL.*calendar_revision IS NOT NULL/,
    );
    assert.match(
      constraint('course_calendar_schedule_check'),
      /jsonb_typeof.*modules/,
    );
    assert.match(
      constraint('course_offerings_import_check'),
      /last_import_module IS NOT NULL/,
    );
    const foreignKeys = constraints.rows.filter((row) =>
      row.definition.startsWith('FOREIGN KEY'),
    );
    assert.match(
      constraint('declaration_documents_enrollment_student_fkey'),
      /FOREIGN KEY \(enrollment_id, student_id\) REFERENCES enrollments\(id, student_id\).*ON DELETE RESTRICT/,
    );
    assert.match(constraint('declaration_documents_status_check'), /DRAFT/);
    assert.match(
      constraint('declaration_documents_archive_hash_check'),
      /source_pdf_sha256/,
    );
    assert.match(
      constraint('declaration_pdf_archives_hash_check'),
      /sha256\(bytes\)/,
    );
    assert.match(constraint('declaration_pdf_archives_size_check'), /16777216/);
    assert.match(constraint('declaration_pdf_archives_pages_check'), /100/);
    assert.match(
      constraint('declaration_pdf_archives_template_check'),
      /minuta-a4-qr-v1/,
    );
    assert.equal(
      column('declaration_documents', 'archive_sha256').is_nullable,
      'YES',
    );
    assert.equal(column('declaration_pdf_archives', 'bytes').udt_name, 'bytea');
    assert.match(constraint('declaration_documents_code_check'), /43/);
    assert.match(constraint('declaration_documents_hash_check'), /64/);
    const snapshotRule = constraint('declaration_documents_snapshot_check');
    for (const term of [
      'snapshot_version',
      'DECLARACAO_VINCULO',
      'STUDENT_REQUEST',
      'testOnly',
    ])
      assert.ok(snapshotRule.includes(term));
    assert.match(
      constraint('declaration_current_issues_document_fkey'),
      /FOREIGN KEY \(document_id, student_id, enrollment_id\)/,
    );
    assert.match(
      constraint('declaration_documents_page_check'),
      /source_pdf_page/,
    );
    for (const name of [
      'document_actions_kind_check',
      'document_actions_reason_check',
      'document_actions_original_fkey',
      'document_actions_successor_fkey',
    ])
      constraint(name);
    const actionsTrigger = await client.query(
      "SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='document_actions_immutable' AND tgenabled='O' AND NOT tgisinternal",
    );
    assert.equal(actionsTrigger.rows[0].count, 1);
    const documentTrigger = await client.query(
      "SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname='declaration_documents_immutable' AND tgenabled='O' AND NOT tgisinternal",
    );
    assert.equal(documentTrigger.rows.length, 1);
    assert.match(
      documentTrigger.rows[0].definition,
      /BEFORE UPDATE ON public.declaration_documents/,
    );
    for (const [table, field, target, deletion] of [
      ['accounts', 'student_id', 'students', 'CASCADE'],
      ['declaration_documents', 'student_id', 'students', 'RESTRICT'],
      ['declaration_documents', 'created_by_id', 'accounts', 'RESTRICT'],
      ['enrollments', 'offering_id', 'course_offerings', 'RESTRICT'],
      [
        'course_calendar_versions',
        'offering_id',
        'course_offerings',
        'RESTRICT',
      ],
      ['course_calendar_versions', 'created_by_id', 'accounts', 'SET NULL'],
      ['sessions', 'account_id', 'accounts', 'CASCADE'],
      ['email_verification_tokens', 'account_id', 'accounts', 'CASCADE'],
      ['password_reset_tokens', 'account_id', 'accounts', 'CASCADE'],
      ['enrollments', 'student_id', 'students', 'CASCADE'],
      ['enrollments', 'reviewed_by_id', 'accounts', 'SET NULL'],
      ['sheet_import_previews', 'actor_id', 'accounts', 'CASCADE'],
      ['enrollment_import_history', 'enrollment_id', 'enrollments', 'CASCADE'],
      ['enrollment_import_history', 'recorded_by_id', 'accounts', 'SET NULL'],
      ['declaration_requests', 'student_id', 'students', 'CASCADE'],
      ['declaration_requests', 'enrollment_id', 'enrollments', 'CASCADE'],
      ['declaration_requests', 'prepared_by_id', 'accounts', 'SET NULL'],
      ['declaration_requests', 'ready_by_id', 'accounts', 'SET NULL'],
      ['retired_profile_photos', 'student_id', 'students', 'CASCADE'],
      ['student_details', 'student_id', 'students', 'CASCADE'],
      ['student_details', 'updated_by_id', 'accounts', 'SET NULL'],
    ]) {
      assert.ok(
        foreignKeys.some(
          (row) =>
            row.table_name === table &&
            row.definition.includes(
              `FOREIGN KEY (${field}) REFERENCES ${target}(id)`,
            ) &&
            row.definition.includes(`ON DELETE ${deletion}`),
        ),
        `FK: ${table}.${field}`,
      );
    }
    const indexes = await client.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'",
    );
    for (const name of [
      'course_calendar_versions_offering_id_revision_key',
      'students_cpf_key',
      'students_school_registration_key',
      'students_import_source_id_key',
      'accounts_student_id_key',
      'accounts_email_key',
      'enrollments_import_source_id_key',
      'enrollments_school_import_key_key',
      'sheet_import_previews_token_hash_key',
      'declaration_documents_public_code_key',
      'enrollments_id_student_id_key',
      'declaration_documents_id_student_id_enrollment_id_key',
      'declaration_document_actions_successor_id_key',
    ]) {
      assert.ok(
        indexes.rows.some(
          (row) =>
            row.indexname === name &&
            row.indexdef.startsWith('CREATE UNIQUE INDEX'),
        ),
        `Índice único: ${name}`,
      );
    }
    assert.ok(
      indexes.rows.some(
        (row) =>
          row.indexname === 'password_reset_tokens_account_id_idx' &&
          /\(account_id\)/.test(row.indexdef),
      ),
      'Índice de tokens por conta.',
    );
    const openRequest = indexes.rows.find(
      (row) => row.indexname === 'declaration_requests_open_enrollment_key',
    );
    assert.ok(openRequest);
    assert.match(
      openRequest.indexdef,
      /CREATE UNIQUE INDEX.*\(enrollment_id\) WHERE .*REQUESTED.*IN_PREPARATION/,
    );

    assert.doesNotMatch(openRequest.indexdef, /AVAILABLE|READY_FOR_PICKUP/);
    assert.match(
      constraint('declaration_requests_document_fkey'),
      /FOREIGN KEY \(document_id, student_id, enrollment_id\) REFERENCES declaration_documents\(id, student_id, enrollment_id\) ON DELETE CASCADE/,
    );
    const registered = await client.query(
      "SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='declaration_requests_registered' AND tgenabled='O' AND NOT tgisinternal",
    );
    assert.equal(registered.rows[0].count, 1);
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    const directories = (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const history = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    );
    assert.deepEqual(
      history.rows.map((row) => row.migration_name),
      directories,
    );
    for (const row of history.rows) {
      assert.ok(
        row.finished_at && !row.rolled_back_at,
        `Migração concluída: ${row.migration_name}`,
      );
      const sql = await readFile(
        new URL(`${row.migration_name}/migration.sql`, migrations),
      );
      assert.equal(
        row.checksum,
        createHash('sha256').update(sql).digest('hex'),
        `Checksum: ${row.migration_name}`,
      );
    }
    await client.query('COMMIT');
    console.log(
      `OK: ${directories.length} migrações, colunas, enums, constraints, FKs, índices únicos e arquivo histórico conferidos.`,
    );
  } finally {
    await client.end();
  }
}
main().catch(reportTestFailure);
