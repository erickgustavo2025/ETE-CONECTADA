import assert from 'node:assert/strict';
import { openTestEnvironment, reportTestFailure } from './test-environment';

// Usar somente no banco NOVO do CI, sem seed. Nunca apaga registros.
async function main() {
  const environment = await openTestEnvironment();
  try {
    const counts = await environment.db.$queryRaw<Array<{ records: bigint }>>`
      SELECT (
        (SELECT count(*) FROM access_attempt_buckets) +
        (SELECT count(*) FROM students) +
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
        (SELECT count(*) FROM declaration_pdf_archives) +
        (SELECT count(*) FROM declaration_document_actions) +
        (SELECT count(*) FROM retired_profile_photos)
      ) AS records
    `;
    assert.equal(
      counts[0].records,
      BigInt(0),
      'Os testes devem remover todos os registros sintéticos do banco novo.',
    );
    console.log(
      'OK: banco descartável sem alunos, contas, matrículas, sessões, tokens, solicitações, tentativas ou fotos residuais.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
