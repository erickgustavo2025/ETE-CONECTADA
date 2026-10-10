import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTestEnvironment, assertDatabaseIdentity } from './test-environment';

const valid = {
  NODE_ENV: 'test',
  ALLOW_TEST_DATABASE_WRITES: 'true',
  TEST_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55432/ete_test_guards',
  TEST_DATABASE_NAME: 'ete_test_guards',
  TEST_DATABASE_ID: '5ed51bf1-2d61-42a8-9a7c-146cce815fe2',
};

test('configuração explícita de banco local descartável é aceita', () => {
  const result = parseTestEnvironment(valid);
  assert.equal(result.url, valid.TEST_DATABASE_URL);
  assert.equal(result.database, valid.TEST_DATABASE_NAME);
  assert.equal(result.identity, valid.TEST_DATABASE_ID);
});

for (const key of Object.keys(valid)) {
  test(`recusa configuração incompleta: ${key}`, () => {
    const env: Record<string, string | undefined> = { ...valid };
    delete env[key];
    assert.throws(() => parseTestEnvironment(env));
  });
}

for (const [label, override] of [
  ['produção mesmo com opt-in', { NODE_ENV: 'production' }],
  ['opt-in diferente de true', { ALLOW_TEST_DATABASE_WRITES: '1' }],
  ['URL principal não substitui URL de teste', { TEST_DATABASE_URL: '', DATABASE_URL: valid.TEST_DATABASE_URL }],
  ['Neon remoto', { TEST_DATABASE_URL: 'postgresql://fixture:fixture@database.neon.tech/ete_test_guards' }],
  ['hostname semelhante a localhost', { TEST_DATABASE_URL: 'postgresql://fixture:fixture@localhost.example.com/ete_test_guards' }],
  ['banco principal mesmo em loopback', { TEST_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/portal', TEST_DATABASE_NAME: 'portal' }],
  ['nome do banco divergente', { TEST_DATABASE_NAME: 'ete_test_outro' }],
  ['override de host via query string', { TEST_DATABASE_URL: valid.TEST_DATABASE_URL + '?host=database.neon.tech' }],
  ['URL inválida não revela senha', { TEST_DATABASE_URL: 'postgresql://SEGREDO_INVALIDO' }],
  ['identidade vazia ou inválida', { TEST_DATABASE_ID: 'marcado-como-teste' }],
  ['portal externo informado', { TEST_BASE_URL: 'https://portal.eteconectada.com' }],
  ['portal existente informado', { TEST_BASE_URL: 'http://localhost:3001' }],
  ['arquivo PDF de saída arbitrário', { TEST_PDF_OUTPUT: '/tmp/arquivo-existente.pdf' }],
  ['arquivo PDF em lote arbitrário', { TEST_BATCH_PDF_OUTPUT: '/tmp/arquivo-existente.pdf' }],
] as const) {
  test(`recusa ${label} sem imprimir credenciais`, () => {
    assert.throws(() => parseTestEnvironment({ ...valid, ...override }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /fixture:fixture|SEGREDO_INVALIDO|postgresql:\/\//);
      return true;
    });
  });
}

test('identidade real do banco deve corresponder ao nome e ao marcador esperados', () => {
  const expected = { database: valid.TEST_DATABASE_NAME, identity: valid.TEST_DATABASE_ID };
  assert.doesNotThrow(() => assertDatabaseIdentity({ database: expected.database, marker: `ETE_CONECTADA_TEST:${expected.identity}` }, expected));
  for (const actual of [
    { database: 'ete_test_outro', marker: `ETE_CONECTADA_TEST:${expected.identity}` },
    { database: expected.database, marker: null },
    { database: expected.database, marker: 'ETE_CONECTADA_TEST:outra-identidade' },
  ]) assert.throws(() => assertDatabaseIdentity(actual, expected));
});
