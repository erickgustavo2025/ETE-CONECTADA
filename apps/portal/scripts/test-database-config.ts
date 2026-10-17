import assert from 'node:assert/strict';
import { utcPostgresUrl } from '../src/lib/database-config';

const original = new URL(
  'postgresql://synthetic:p%40ss%3Aword@127.0.0.1:5432/ete_test_config?sslmode=require&application_name=portal',
);
const normalized = new URL(utcPostgresUrl(original.toString()));
for (const key of [
  'protocol',
  'username',
  'password',
  'hostname',
  'port',
  'pathname',
] as const)
  assert.equal(normalized[key], original[key]);
assert.equal(normalized.searchParams.get('sslmode'), 'require');
assert.equal(normalized.searchParams.get('application_name'), 'portal');
assert.equal(normalized.searchParams.get('options'), '-c TimeZone=UTC');
assert.equal(
  new URL(
    utcPostgresUrl(
      'postgres://localhost/ete_test_config',
      '-c statement_timeout=5000 -c TimeZone=America/Fortaleza',
    ),
  ).searchParams.get('options'),
  '-c statement_timeout=5000 -c TimeZone=America/Fortaleza -c TimeZone=UTC',
);
original.searchParams.set(
  'options',
  '-c statement_timeout=4000 -c TimeZone=America/Fortaleza',
);
assert.equal(
  new URL(
    utcPostgresUrl(original.toString(), '-c statement_timeout=9000'),
  ).searchParams.get('options'),
  '-c statement_timeout=4000 -c TimeZone=America/Fortaleza -c TimeZone=UTC',
);
original.searchParams.set('options', '');
assert.equal(
  new URL(
    utcPostgresUrl(original.toString(), '-c statement_timeout=9000'),
  ).searchParams.get('options'),
  '-c TimeZone=UTC',
);
for (const value of [
  '',
  'synthetic secret invalid URL',
  'https://synthetic:secret@localhost/db',
  'postgresql://localhost/db#secret',
  'postgresql://localhost/db?options=a&options=b',
])
  assert.throws(
    () => utcPostgresUrl(value),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Configuração PostgreSQL inválida.' &&
      !error.cause,
  );
console.log(
  'OK: UTC explícito, opções e credenciais preservadas, erros sem dados da conexão.',
);
