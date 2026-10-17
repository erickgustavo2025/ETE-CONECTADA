import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { utcPostgresUrl } from '../src/lib/database-config';
import {
  assertDatabaseIdentity,
  openTestEnvironment,
  parseTestEnvironment,
  reportTestFailure,
} from './test-environment';

async function checkClock(db: PrismaClient) {
  const [clock] = await db.$queryRaw<
    Array<{ zone: string; raw: Date; epochMs: number }>
  >`
    WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS stamp)
    SELECT current_setting('TimeZone') AS zone, stamp AS raw,
      (extract(epoch from stamp) * 1000)::double precision AS "epochMs" FROM clock
  `;
  assert.equal(
    clock.zone,
    'UTC',
    'Conexão da aplicação precisa ter fuso UTC explícito.',
  );
  assert.ok(
    Math.abs(clock.raw.getTime() - clock.epochMs) < 2,
    'Leitura do driver deve corresponder ao instante do PostgreSQL.',
  );
  const rollback = new Error('rollback sintético do relógio');
  await assert.rejects(
    db.$transaction(async (tx) => {
      const stamp = new Date('2026-10-17T02:30:45.123Z');
      const birth = new Date('2008-01-15T00:00:00Z');
      const student = await tx.student.create({
        data: {
          birthDate: birth,
          fullName: 'Relógio Sintético',
          createdAt: stamp,
        },
      });
      assert.equal(student.createdAt.getTime(), stamp.getTime());
      assert.equal(student.birthDate.getTime(), birth.getTime());
      const [stored] = await tx.$queryRaw<
        Array<{ stamp: Date; epochMs: number; birth: string }>
      >`
      SELECT created_at AS stamp, (extract(epoch from created_at) * 1000)::double precision AS "epochMs",
        birth_date::text AS birth FROM students WHERE id = ${student.id}::uuid
    `;
      assert.equal(
        stored.epochMs,
        stamp.getTime(),
        'Escrita ORM precisa guardar o instante exato.',
      );
      assert.equal(stored.stamp.getTime(), stamp.getTime());
      assert.equal(stored.birth, '2008-01-15', 'DATE não deve mudar de dia.');
      const generated = await tx.student.create({ data: { birthDate: birth } });
      const [actual] = await tx.$queryRaw<Array<{ epochMs: number }>>`
      SELECT (extract(epoch from created_at) * 1000)::double precision AS "epochMs"
      FROM students WHERE id = ${generated.id}::uuid
    `;
      assert.ok(
        Math.abs(generated.createdAt.getTime() - actual.epochMs) < 2,
        'Timestamp gerado pelo banco também deve ser lido sem deslocamento.',
      );
      throw rollback;
    }),
    (error: unknown) => error === rollback,
  );
}

async function main() {
  const environment = await openTestEnvironment();
  try {
    await checkClock(environment.db);
    // A URL original sem parâmetros e o marcador já foram conferidos antes de
    // derivar opções controladas. As guardas gerais de teste não são afrouxadas.
    const expected = parseTestEnvironment(process.env);
    for (const zone of ['America/Fortaleza', 'UTC']) {
      const url = new URL(expected.url);
      url.searchParams.set(
        'options',
        `-c TimeZone=${zone} -c statement_timeout=5000`,
      );
      const db = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: utcPostgresUrl(url.toString()),
          max: 2,
        }),
      });
      try {
        const [identity] = await db.$queryRaw<
          Array<{ database: string; marker: string | null }>
        >`
          SELECT current_database() AS database, shobj_description(oid, 'pg_database') AS marker
          FROM pg_database WHERE datname = current_database()
        `;
        assertDatabaseIdentity(identity, expected);
        const [options] = await db.$queryRaw<
          Array<{ timeout: string }>
        >`SELECT current_setting('statement_timeout') AS timeout`;
        assert.equal(
          options.timeout,
          '5s',
          'Opções existentes precisam ser preservadas.',
        );
        await checkClock(db);
      } finally {
        await db.$disconnect();
      }
    }
    console.log(
      'OK: getDb e opções UTC/Fortaleza, SQL/ORM sem desvio, DATE preservado e fixtures desfeitas.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
