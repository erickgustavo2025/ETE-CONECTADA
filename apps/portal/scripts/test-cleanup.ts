import assert from 'node:assert/strict';
import { Client } from 'pg';
import {
  assertDatabaseIdentity,
  parseTestEnvironment,
  reportTestFailure,
} from './test-environment';

// Usar somente no banco NOVO do CI, sem seed. Nunca apaga registros.
async function main() {
  const expected = parseTestEnvironment(process.env);
  const client = new Client({
    connectionString: expected.url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(
      "SELECT current_database() AS database,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    assertDatabaseIdentity(identity.rows[0], expected);
    const counts = await client.query<{ records: string }>(`
      SELECT (
        (SELECT count(*) FROM access_attempt_buckets) +
        (SELECT count(*) FROM students) +
        (SELECT count(*) FROM student_access_changes) +
        (SELECT count(*) FROM school_academic_events) +
        (SELECT count(*) FROM course_calendar_versions) +
        (SELECT count(*) FROM course_offerings) +
        (SELECT count(*) FROM student_details) +
        (SELECT count(*) FROM sheet_import_previews) +
        (SELECT count(*) FROM enrollment_import_history) +
        (SELECT count(*) FROM accounts) +
        (SELECT count(*) FROM enrollments) +
        (SELECT count(*) FROM sessions) +
        (SELECT count(*) FROM email_verification_tokens) +
        (SELECT count(*) FROM password_reset_tokens) +
        (SELECT count(*) FROM declaration_requests) +
        (SELECT count(*) FROM declaration_documents) +
        (SELECT count(*) FROM declaration_current_issues) +
        (SELECT count(*) FROM declaration_pdf_archives) +
        (SELECT count(*) FROM declaration_document_actions) +
        (SELECT count(*) FROM retired_profile_photos)
      ) AS records
    `);
    assert.equal(
      BigInt(counts.rows[0].records),
      BigInt(0),
      'A fonte não deve receber os registros dos cenários.',
    );
    const prefix = `ete_test_case_${expected.identity.slice(0, 8)}_`;
    const residual = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_database WHERE left(datname,length($1))=$1',
      [prefix],
    );
    assert.equal(
      residual.rows[0].n,
      0,
      'Cenários próprios ainda existem após os testes.',
    );
    await client.query('ROLLBACK');
    console.log(
      'OK: banco descartável sem alunos, contas, matrículas, sessões, tokens, solicitações, tentativas ou fotos residuais.',
    );
  } finally {
    await client.end();
  }
}
main().catch(reportTestFailure);
