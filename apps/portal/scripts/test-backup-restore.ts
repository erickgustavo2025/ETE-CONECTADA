import { drawDeclarationQr } from '../src/lib/declaration-qr';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Client } from 'pg';
import { canonicalCheckDefinition } from './backup-catalog';
import { createTestDatabaseScenario } from './test-database-scenario';
import { assertDatabaseIdentity, reportTestFailure } from './test-environment';

// Ensaio próprio: não aceita arquivo, destino ou conexão externa por argumento.
const bin = process.env.TEST_PG_BIN ?? '';
assert.ok(path.isAbsolute(bin), 'Informe TEST_PG_BIN do PostgreSQL 16.');
for (const command of ['pg_dump', 'pg_restore']) {
  const result = spawnSync(path.join(bin, command), ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, 'Cliente PostgreSQL indisponível.');
  assert.match(result.stdout, /\(PostgreSQL\) 16\./);
}
const connect = (url: string) =>
  new Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    options: '-c timezone=UTC',
  });
let archiveHash = '';
let qrArchiveHash = '';
const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
async function identity(client: Client, database: string, id: string) {
  const result = await client.query(
    "SELECT current_database() AS database, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
  );
  assertDatabaseIdentity(result.rows[0], { database, identity: id });
}
async function snapshot(client: Client) {
  await client.query('BEGIN READ ONLY');
  try {
    const names = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const tables: Record<string, { count: number; hash: string }> = {};
    for (const { tablename } of names.rows) {
      const rows = await client.query(
        `SELECT row_to_json(t)::text AS row FROM public.${quote(tablename)} t ORDER BY row_to_json(t)::text`,
      );
      tables[tablename] = {
        count: rows.rowCount!,
        hash: digest(JSON.stringify(rows.rows)),
      };
    }
    const catalog = [];
    for (const sql of [
      "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      "SELECT c.conname, c.contype, c.convalidated, c.condeferrable, c.condeferred, c.conrelid::regclass::text AS relation, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY relation,c.conname",
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
      "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
      "SELECT p.proname, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid::regprocedure::text",
      'SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname',
    ]) {
      const rows = (await client.query(sql)).rows;
      catalog.push(
        rows.map((row) =>
          row.contype === 'c'
            ? { ...row, definition: canonicalCheckDefinition(row.definition) }
            : row,
        ),
      );
    }
    return { tables, catalog };
  } finally {
    await client.query('ROLLBACK');
  }
}
function command(name: string, args: string[], url: URL) {
  // Sem shell, URL na linha de comando, .env ou valores herdados de libpq.
  const result = spawnSync(path.join(bin, name), args, {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      LANG: 'C.UTF-8',
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGCONNECT_TIMEOUT: '5',
      PGOPTIONS: '-c statement_timeout=30000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, 'Ferramenta de backup/restauração falhou.');
}

async function checkRules(client: Client) {
  await client.query('BEGIN');
  try {
    await assert.rejects(
      () =>
        client.query(
          'UPDATE declaration_document_actions SET reason=$1 WHERE document_id=$2',
          ['Alteração retroativa', document],
        ),
      (error: unknown) => (error as { code?: string }).code === '23000',
    );
  } finally {
    await client.query('ROLLBACK');
  }
  await client.query('BEGIN');
  try {
    await assert.rejects(
      () =>
        client.query(
          'UPDATE declaration_documents SET source_pdf_page=2 WHERE id=$1',
          [document],
        ),
      (error: unknown) => (error as { code?: string }).code === '23000',
    );
  } finally {
    await client.query('ROLLBACK');
  }
  const qrFile = await client.query<{
    bytes: Buffer;
    template_version: string;
  }>(
    'SELECT bytes,template_version FROM declaration_pdf_archives WHERE sha256=$1',
    [qrArchiveHash],
  );
  assert.equal(qrFile.rows[0].template_version, 'minuta-a4-qr-v1');
  assert.equal(digest(qrFile.rows[0].bytes), qrArchiveHash);
  assert.equal(
    (await PDFDocument.load(qrFile.rows[0].bytes)).getPageCount(),
    1,
  );
  const delivered = await client.query(
    'SELECT status,document_id,prepared_by_id,ready_by_id FROM declaration_requests WHERE id=$1',
    [automaticRequest],
  );
  assert.deepEqual(
    delivered.rows,
    [
      {
        status: 'AVAILABLE',
        document_id: issuedDocument,
        prepared_by_id: null,
        ready_by_id: null,
      },
    ],
    'Backup preserva a entrega automática sem autorização humana inventada.',
  );
  const file = await client.query<{ bytes: Buffer }>(
    'SELECT bytes FROM declaration_pdf_archives WHERE sha256=$1',
    [archiveHash],
  );
  assert.equal(file.rowCount, 1);
  assert.equal(
    (
      await client.query(
        'SELECT document_id FROM declaration_current_issues WHERE enrollment_id=$1',
        [otherEnrollment],
      )
    ).rows[0].document_id,
    issuedDocument,
  );
  assert.equal(
    (
      await client.query(
        'SELECT snapshot_version,status FROM declaration_documents WHERE id=$1',
        [document],
      )
    ).rows[0].status,
    'DRAFT',
  );
  assert.equal(
    (
      await client.query(
        'SELECT status FROM declaration_documents WHERE id=$1',
        [issuedDocument],
      )
    ).rows[0].status,
    'ISSUED',
  );
  assert.equal(
    digest(file.rows[0].bytes),
    archiveHash,
    'Backup preserva os bytes finais do PDF.',
  );
  assert.equal((await PDFDocument.load(file.rows[0].bytes)).getPageCount(), 1);
  await client.query('BEGIN');
  try {
    await assert.rejects(
      () =>
        client.query(
          "UPDATE declaration_pdf_archives SET template_version='alterada' WHERE sha256=$1",
          [archiveHash],
        ),
      (error: unknown) => (error as { code?: string }).code === '23000',
    );
  } finally {
    await client.query('ROLLBACK');
  }

  const protectedHistory = [
    [
      'UPDATE enrollment_import_history SET reason=$1 WHERE id=$2',
      ['IDENTITY_REVIEW', history],
    ],
    ['DELETE FROM enrollment_import_history WHERE id=$1', [history]],
    ['TRUNCATE enrollment_import_history', []],
  ] as const;
  for (const [sql, values] of protectedHistory) {
    await client.query('BEGIN');
    try {
      await assert.rejects(
        () => client.query(sql, [...values]),
        (error: unknown) => (error as { code?: string }).code === '23000',
      );
    } finally {
      await client.query('ROLLBACK');
    }
  }
  console.log('OK: histórico restaurado recusa alteração, exclusão e limpeza.');
  async function checkDomain(sql: string, values: string[], accepted: boolean) {
    await client.query('BEGIN');
    try {
      if (accepted) assert.equal((await client.query(sql, values)).rowCount, 1);
      else
        await assert.rejects(
          () => client.query(sql, values),
          (error: unknown) => (error as { code?: string }).code === '23514',
        );
    } finally {
      await client.query('ROLLBACK');
    }
  }
  for (const course of ['ADM', 'DS', 'ENF', 'ZZZ'])
    await checkDomain(
      'UPDATE course_offerings SET course_label=$1 WHERE id=$2',
      [course, offering],
      course !== 'ZZZ',
    );
  for (const reason of [
    'METADATA_CHANGE',
    'IDENTITY_REVIEW',
    'CALENDAR_PROGRESSION',
    'CALENDAR_BINDING',
    'CALENDAR_HOLD',
    'UNAPPROVED',
  ])
    await checkDomain(
      `INSERT INTO enrollment_import_history
        (enrollment_id, recorded_by_id, reason, mode, class_name, course_label, status)
        SELECT enrollment_id, recorded_by_id, $1, mode, class_name, course_label, status
        FROM enrollment_import_history WHERE id=$2`,
      [reason, history],
      reason !== 'UNAPPROVED',
    );
  for (const state of [
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
    'ZZ',
  ])
    await checkDomain(
      'UPDATE student_details SET birth_state=$1 WHERE student_id=$2',
      [state, student],
      state !== 'ZZ',
    );
  console.log(
    'OK: cursos, motivos de histórico e 27 UFs aceitos; valores externos recusados pelas três constraints.',
  );
}
const document = randomUUID();
const issuedDocument = randomUUID();
const automaticRequest = randomUUID();
const [
  student,
  otherStudent,
  account,
  otherAccount,
  enrollment,
  otherEnrollment,
  offering,
  calendar,
  request,
  otherRequest,
  history,
] = Array.from({ length: 11 }, () => randomUUID());

async function main() {
  let sourceCase:
    Awaited<ReturnType<typeof createTestDatabaseScenario>> | undefined;
  let targetCase:
    Awaited<ReturnType<typeof createTestDatabaseScenario>> | undefined;
  let sourceClient: Client | undefined;
  let targetClient: Client | undefined;
  let work = '';
  let failure: unknown;
  try {
    sourceCase = await createTestDatabaseScenario();
    targetCase = await createTestDatabaseScenario({ schema: 'empty' });
    const expected = sourceCase.config;
    const {
      database: destination,
      identity: destinationIdentity,
      url: destinationConnection,
    } = targetCase.config;
    assert.notEqual(destination, expected.database);
    const sourceUrl = new URL(expected.url);
    const destinationUrl = new URL(destinationConnection);
    const source = (sourceClient = connect(expected.url));
    const target = (targetClient = connect(destinationConnection));
    await source.connect();
    await identity(source, expected.database, expected.identity);
    const initial = await snapshot(source);
    for (const name of [
      'students',
      'accounts',
      'enrollments',
      'course_offerings',
      'declaration_requests',
      'declaration_documents',
      'declaration_pdf_archives',
      'declaration_document_actions',
      'declaration_current_issues',
    ])
      assert.equal(
        initial.tables[name]?.count,
        0,
        'Exige banco sintético sem dados de negócio.',
      );
    work = await mkdtemp(path.join(tmpdir(), 'ete-backup-lab-'));
    await chmod(work, 0o700);
    await target.connect();
    await identity(target, destination, destinationIdentity);
    await assert.rejects(
      () => identity(target, destination, randomUUID()),
      /Banco não identificado/,
    );
    assert.deepEqual((await snapshot(target)).tables, {});

    await source.query('BEGIN');
    try {
      await source.query(
        "INSERT INTO students(id,full_name,birth_date,school_registration,registration_allowed) VALUES($1,'Aluno Fictício Integrado','2008-01-01','0000123',false),($2,'Aluno Fictício Subsequente','2000-02-02','00123456',false)",
        [student, otherStudent],
      );
      await source.query(
        "INSERT INTO accounts(id,student_id,email,password_hash,status,role) VALUES($1,$2,'integrado@example.invalid','hash-ficticio-nao-utilizavel','active','secretary'),($3,$4,'subsequente@example.invalid','outro-hash-ficticio','active','student')",
        [account, student, otherAccount, otherStudent],
      );
      await source.query(
        "INSERT INTO student_details(student_id,parent_one,parentage_source,birth_city,birth_state,birth_country,birthplace_source,updated_by_id) VALUES($1,'Responsável Fictício','SCHOOL_RECORD','Recife','PE','BR','SECRETARY_CORRECTION',$2)",
        [student, account],
      );
      await source.query(
        "INSERT INTO course_offerings(id,label,course_label) VALUES($1,'Turma fictícia de restauração','DS')",
        [offering],
      );
      await source.query(
        'INSERT INTO course_calendar_versions(id,offering_id,revision,schedule,created_by_id) VALUES($1,$2,1,$3,$4)',
        [
          calendar,
          offering,
          JSON.stringify({
            courseLabel: 'DS',
            modules: [
              {
                number: 1,
                startsOn: '2026-07-01',
                endsOn: '2026-12-31',
                periodLabel: '2026.2',
              },
              {
                number: 2,
                startsOn: '2027-01-01',
                endsOn: '2027-06-30',
                periodLabel: '2027.1',
              },
              {
                number: 3,
                startsOn: '2027-07-01',
                endsOn: '2027-12-31',
                periodLabel: '2027.2',
              },
            ],
          }),
          account,
        ],
      );
      await source.query(
        "INSERT INTO enrollments(id,student_id,mode,class_name,grade,course_label,school_year) VALUES($1,$2,'INTEGRADO','Fictícia I',1,'DS',2026)",
        [enrollment, student],
      );
      await source.query(
        "INSERT INTO enrollments(id,student_id,mode,class_name,course_label,module_number,offering_id,calendar_module,calendar_revision) VALUES($1,$2,'SUBSEQUENTE','Fictícia S','DS',1,$3,1,1)",
        [otherEnrollment, otherStudent, offering],
      );
      await source.query(
        'INSERT INTO declaration_requests(id,student_id,enrollment_id) VALUES($1,$2,$3),($4,$5,$6)',
        [
          request,
          student,
          enrollment,
          otherRequest,
          otherStudent,
          otherEnrollment,
        ],
      );
      await source.query(
        "INSERT INTO enrollment_import_history(id,enrollment_id,recorded_by_id,reason,mode,class_name,course_label,status) VALUES($1,$2,$3,'METADATA_CHANGE','SUBSEQUENTE','Fictícia anterior','DS','UNCONFIRMED')",
        [history, otherEnrollment, account],
      );
      const archivePdf = await PDFDocument.create();
      archivePdf.addPage();
      const archiveBytes = Buffer.from(await archivePdf.save());
      archiveHash = digest(archiveBytes);
      const issuedCode = randomBytes(32).toString('base64url');
      const qrPdf = await PDFDocument.create();
      drawDeclarationQr(
        qrPdf.addPage([595.28, 841.89]),
        {
          code: issuedCode,
          url: 'https://portal.example.invalid/validar/' + issuedCode,
        },
        45,
        84,
        54,
      );
      const qrBytes = Buffer.from(await qrPdf.save());
      qrArchiveHash = digest(qrBytes);
      await source.query(
        "INSERT INTO declaration_pdf_archives(sha256,bytes,page_count,template_version) VALUES($1,$2,1,'minuta-a4-qr-v1')",
        [qrArchiveHash, qrBytes],
      );

      await source.query(
        "INSERT INTO declaration_pdf_archives(sha256,bytes,page_count,template_version) VALUES($1,$2,1,'minuta-a4-v1')",
        [archiveHash, archiveBytes],
      );
      await source.query(
        'INSERT INTO declaration_documents(id,public_code,student_id,enrollment_id,created_by_id,snapshot,source_pdf_sha256,source_pdf_page,archive_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,1,$7)',
        [
          document,
          randomBytes(32).toString('base64url'),
          student,
          enrollment,
          account,
          JSON.stringify({
            type: 'DECLARACAO_VINCULO',
            body: 'Minuta fictícia privada de restauração',
          }),
          archiveHash,
        ],
      );
      await source.query(
        "INSERT INTO declaration_document_actions(document_id,student_id,enrollment_id,action,reason,created_by_id) VALUES($1,$2,$3,'CANCELLED','Minuta fictícia cancelada',$4)",
        [document, student, enrollment, account],
      );
      await source.query(
        "INSERT INTO declaration_documents(id,public_code,student_id,enrollment_id,created_by_id,status,origin,request_key,snapshot_version,snapshot,source_pdf_sha256,source_pdf_page,archive_sha256) VALUES($1,$2,$3,$4,$5,'ISSUED','STUDENT_REQUEST',$6,2,$7,$8,1,$8)",
        [
          issuedDocument,
          issuedCode,
          otherStudent,
          otherEnrollment,
          otherAccount,
          randomUUID(),
          JSON.stringify({
            type: 'DECLARACAO_VINCULO',
            testOnly: true,
            subjectName: 'Aluno fictício',
            body: 'Emissão fictícia',
          }),
          qrArchiveHash,
        ],
      );
      await source.query(
        "INSERT INTO declaration_current_issues(enrollment_id,document_type,student_id,document_id) VALUES($1,'DECLARACAO_VINCULO',$2,$3)",
        [otherEnrollment, otherStudent, issuedDocument],
      );
      await source.query(
        "INSERT INTO declaration_requests(id,student_id,enrollment_id,status,generated_at,document_id) VALUES($1,$2,$3,'AVAILABLE',now(),$4)",
        [automaticRequest, otherStudent, otherEnrollment, issuedDocument],
      );
      await source.query(
        'UPDATE students SET login_blocked=true,issuance_blocked=true,access_revision=2 WHERE id=$1',
        [student],
      );
      await source.query(
        "INSERT INTO student_access_changes(student_id,created_by_id,request_key,kind,blocked,reason,revision) VALUES($1,$2,$3,'LOGIN',true,'Bloqueio fictício do ensaio',1)",
        [student, account, randomUUID()],
      );
      await source.query(
        "INSERT INTO student_access_changes(student_id,created_by_id,request_key,kind,blocked,reason,revision) VALUES($1,$2,$3,'ISSUANCE',true,'Emissão fictícia bloqueada',2)",
        [student, account, randomUUID()],
      );
      await source.query(
        "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now() + interval '1 day')",
        [digest('sessao-ficticia-' + randomUUID()), account],
      );
      await source.query(
        "INSERT INTO email_verification_tokens(token_hash,account_id,expires_at) VALUES($1,$2,now() + interval '1 day')",
        [digest('verificacao-ficticia-' + randomUUID()), otherAccount],
      );
      await source.query(
        "INSERT INTO password_reset_tokens(token_hash,account_id,credential_hash,expires_at) VALUES($1,$2,$3,now() + interval '1 day')",
        [digest(randomUUID()), account, digest('credencial-ficticia')],
      );
      await source.query('COMMIT');
    } catch (error) {
      await source.query('ROLLBACK');
      throw error;
    }
    await checkRules(source);
    const original = await snapshot(source);
    const archive = path.join(work, 'database.dump');
    const started = Date.now();
    command('pg_dump', ['--format=custom', '--file', archive], sourceUrl);
    await chmod(archive, 0o600);
    const bytes = await readFile(archive);
    const hash = digest(bytes);
    async function restore(file: string, wantedIdentity = destinationIdentity) {
      assert.equal(
        digest(await readFile(file)),
        hash,
        'Arquivo de backup adulterado.',
      );
      await identity(target, destination, wantedIdentity);
      assert.deepEqual(
        (await snapshot(target)).tables,
        {},
        'Destino precisa estar vazio.',
      );
      command(
        'pg_restore',
        [
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          '--dbname',
          destination,
          file,
        ],
        destinationUrl,
      );
    }
    const damaged = path.join(work, 'damaged.dump');
    await writeFile(damaged, bytes.subarray(0, Math.floor(bytes.length / 2)), {
      mode: 0o600,
    });
    await assert.rejects(() => restore(damaged), /backup adulterado/);
    await assert.rejects(
      () => restore(archive, randomUUID()),
      /Banco não identificado/,
    );
    assert.deepEqual((await snapshot(target)).tables, {});
    await restore(archive);
    const restored = await snapshot(target);
    // Diagnóstico do catálogo versionado e contagens, sem linhas ou hashes de contas.
    for (const table of Object.keys(original.tables)) {
      if (!isDeepStrictEqual(restored.tables[table], original.tables[table]))
        console.error(
          'Divergência de restauração na tabela:',
          table,
          'contagem original/restaurada:',
          original.tables[table].count,
          restored.tables[table]?.count,
        );
    }
    for (const [index, rows] of original.catalog.entries()) {
      const actual = restored.catalog[index];
      if (!isDeepStrictEqual(rows, actual)) {
        console.error(
          'Divergência no catálogo:',
          index,
          'itens original/restaurado:',
          rows.length,
          actual.length,
        );
        for (let row = 0; row < Math.max(rows.length, actual.length); row++) {
          if (!isDeepStrictEqual(rows[row], actual[row])) {
            console.error(
              'Item:',
              row,
              'campos diferentes:',
              Object.keys(rows[row] ?? {})
                .filter(
                  (key) =>
                    !isDeepStrictEqual(rows[row][key], actual[row]?.[key]),
                )
                .join(','),
            );
            if (index === 1)
              console.error(
                'Constraint do schema sintético:',
                JSON.stringify({
                  name: rows[row]?.conname,
                  relation: rows[row]?.relation,
                  original: rows[row]?.definition,
                  restored: actual[row]?.definition,
                }),
              );
          }
        }
      }
    }
    assert.deepEqual(
      restored,
      original,
      'Dados e catálogo restaurados devem coincidir integralmente.',
    );
    await assert.rejects(() => restore(archive), /Destino precisa estar vazio/);
    await checkRules(target);
    await target.query('BEGIN');
    try {
      await assert.rejects(
        () =>
          target.query(
            "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now() + interval '1 day')",
            [digest(randomUUID()), randomUUID()],
          ),
        (error: unknown) => (error as { code?: string }).code === '23503',
      );
    } finally {
      await target.query('ROLLBACK');
    }
    assert.deepEqual(
      await snapshot(source),
      original,
      'Origem preservada pela restauração.',
    );
    assert.deepEqual(
      await snapshot(target),
      original,
      'Recusas não alteram a restauração.',
    );
    console.log(
      `OK: backup custom e restauração isolada; ${Object.keys(original.tables).length} tabelas, dados/catálogo/FKs preservados; ${bytes.length} bytes em ${Date.now() - started}ms (observação de laboratório).`,
    );
    console.log(
      'OK: arquivo adulterado, marcador errado e destino ocupado recusados sem alteração.',
    );
  } catch (error) {
    failure = error;
  } finally {
    // Uma falha de remoção não pula o fechamento/limpeza dos demais recursos próprios.
    for (const cleanup of [
      async () => {
        await targetClient?.end();
      },
      async () => {
        await sourceClient?.end();
      },
      async () => {
        await targetCase?.close();
      },
      async () => {
        await sourceCase?.close();
      },
      async () => {
        if (work) await rm(work, { recursive: true, force: true });
      },
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
}
main().catch(reportTestFailure);
