import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import {
  readAccessBody,
  validAccessPassword,
  ACCESS_BODY_LIMIT,
} from '../src/lib/access-input';

const url = 'http://127.0.0.1/api/test';
const jsonRequest = (body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function rejected(request: Request, status: number) {
  const result = await readAccessBody(request);
  assert.ok('response' in result);
  assert.equal(result.response.status, status);
  assert.deepEqual(Object.keys(await result.response.json()), ['error']);
}

test('leitor aceita JSON objeto e recusa tipos raiz, JSON/UTF-8 inválidos e mídia incorreta', async () => {
  assert.deepEqual(await readAccessBody(jsonRequest({ message: 'ação 😀' })), {
    body: { message: 'ação 😀' },
  });
  for (const body of [null, [], ['x'], 12, true, 'text'])
    await rejected(jsonRequest(body), 400);
  for (const body of ['', '{', new Uint8Array([0xff])])
    await rejected(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      400,
    );
  await rejected(new Request(url, { method: 'POST', body: '{}' }), 415);
  await rejected(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    400,
  );
});

test('limite exato em bytes; Unicode, ausência/cabeçalho subestimado não contornam o teto', async () => {
  const exact = JSON.stringify({ value: 'a'.repeat(ACCESS_BODY_LIMIT - 12) });
  assert.equal(Buffer.byteLength(exact), ACCESS_BODY_LIMIT);
  assert.ok(
    'body' in
      (await readAccessBody(
        new Request(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: exact,
        }),
      )),
  );
  for (const body of [
    exact + ' ',
    JSON.stringify({ value: '😀'.repeat(1100) }),
  ]) {
    for (const header of [undefined, '1'])
      await rejected(
        new Request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(header ? { 'Content-Length': header } : {}),
          },
          body,
        }),
        413,
      );
  }
  await rejected(
    new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(ACCESS_BODY_LIMIT + 1),
      },
      body: '{}',
    }),
    413,
  );
});

test('leitor interrompe stream excessivo e libera reader, mesmo em falha de leitura', async () => {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
        if (pulled === 8) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await rejected(request, 413);
  assert.equal(cancelled, true);
  assert.equal(pulled, 5);
  assert.equal(stream.locked, false);
  const broken = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error('fixture'));
    },
  });
  await rejected(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: broken,
      duplex: 'half',
    } as RequestInit),
    400,
  );
  assert.equal(broken.locked, false);
});

test(
  'corpo excessivo retorna 413 sem aguardar cancelamento pendente',
  { timeout: 1000 },
  async () => {
    const pendingStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(ACCESS_BODY_LIMIT + 1));
        },
        cancel() {
          return new Promise<void>(() => {});
        },
      });
    for (const declared of [undefined, String(ACCESS_BODY_LIMIT + 1)]) {
      const stream = pendingStream();
      await rejected(
        new Request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(declared ? { 'Content-Length': declared } : {}),
          },
          body: stream,
          duplex: 'half',
        } as RequestInit),
        413,
      );
      assert.equal(stream.locked, false);
    }
  },
);

test('senha preservada e limites 8/128; recusa 7/129 e tipos não string', () => {
  for (const value of ['a'.repeat(8), '😀'.repeat(64), ' '.repeat(128)])
    assert.equal(validAccessPassword(value), true);
  for (const value of ['a'.repeat(7), 'a'.repeat(129), 12345678, null, [], {}])
    assert.equal(validAccessPassword(value), false);
});

test('handlers negam entradas antes de banco/scrypt; controles válidos chegam às operações protegidas', async (t) => {
  const previousMode = process.env.NODE_ENV;
  const previousDb = Object.getOwnPropertyDescriptor(
    globalThis,
    'portalPrisma',
  );
  let databaseCalls = 0;
  let hashCalls = 0;
  let allowLoginLookup = false;
  Reflect.set(process.env, 'NODE_ENV', 'development');
  Object.defineProperty(globalThis, 'portalPrisma', {
    configurable: true,
    get() {
      if (allowLoginLookup)
        return {
          account: {
            findFirst: async () => {
              databaseCalls++;
              return {
                id: 'fixture',
                passwordHash: `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`,
              };
            },
          },
        };
      databaseCalls++;
      throw new Error('Banco proibido nesta prova.');
    },
  });
  // Importação posterior garante que promisify capture a função instrumentada.
  t.mock.method(crypto, 'scrypt', () => {
    hashCalls++;
    throw new Error('Scrypt instrumentado.');
  });
  syncBuiltinESMExports();
  try {
    const handlers = [
      (await import('../src/app/api/login/route')).POST,
      (await import('../src/app/api/registration/check/route')).POST,
      (await import('../src/app/api/registration/start/route')).POST,
      (await import('../src/app/api/registration/verify/route')).POST,
    ];
    const identity = {
      schoolRegistration: '01234567',
      birthDate: '2008-01-15',
      parentName: 'Filiação Fictícia Um',
    };
    const signup = {
      ...identity,
      cpf: '452.781.963-19',
      email: 'fixture@eteconectada.invalid',
      password: 'Abcd123!',
      confirmPassword: 'Abcd123!',
    };
    const valid = [
      { identifier: signup.email, password: signup.password },
      identity,
      signup,
      { token: 'A'.repeat(43) },
    ];
    const invalid = [
      [
        { identifier: ['x'], password: signup.password },
        { identifier: 'x'.repeat(321), password: signup.password },
        { identifier: '   ', password: signup.password },
        ...[7, 129].map((n) => ({
          identifier: signup.email,
          password: 'a'.repeat(n),
        })),
        { identifier: signup.email, password: {} },
      ],
      [
        { ...identity, schoolRegistration: 12345678 },
        { ...identity, schoolRegistration: ' '.repeat(33) },
        { ...identity, birthDate: [] },
        { ...identity, birthDate: '2008-01-15x' },
        ...[undefined, [], 'Ana', 'x'.repeat(181), 'Nome\u0000 Sobrenome'].map(
          (parentName) => ({ ...identity, parentName }),
        ),
      ],
      [
        { ...signup, cpf: 123 },
        { ...signup, cpf: 'x'.repeat(33) },
        { ...signup, email: [] },
        { ...signup, email: 'x'.repeat(321) },
        { ...signup, confirmPassword: {} },
        ...[undefined, [], 'Ana', 'x'.repeat(181), 'Nome\u0000 Sobrenome'].map(
          (parentName) => ({ ...signup, parentName }),
        ),
        ...[7, 129].map((n) => ({
          ...signup,
          password: 'a'.repeat(n),
          confirmPassword: 'a'.repeat(n),
        })),
      ],
      [
        { token: [] },
        { token: 123 },
        { token: 'a'.repeat(51) },
        { token: 'a'.repeat(39) },
      ],
    ];
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i];
      for (const body of [null, [], true, 'x', {}, ...invalid[i]]) {
        databaseCalls = hashCalls = 0;
        const response = await handler(jsonRequest(body));
        assert.equal(response.status, 400);
        assert.equal(
          databaseCalls,
          0,
          `Rota ${i}: não consultar banco para entrada recusada.`,
        );
        assert.equal(
          hashCalls,
          0,
          `Rota ${i}: não calcular senha para entrada recusada.`,
        );
        assert.equal(response.headers.get('set-cookie'), null);
      }
      for (const header of [undefined, '1', String(ACCESS_BODY_LIMIT + 1)]) {
        databaseCalls = hashCalls = 0;
        const response = await handler(
          new Request(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(header ? { 'Content-Length': header } : {}),
            },
            body: JSON.stringify({
              ...valid[i],
              padding: 'a'.repeat(ACCESS_BODY_LIMIT),
            }),
          }),
        );
        assert.equal(response.status, 413);
        assert.equal(databaseCalls, 0);
        assert.equal(hashCalls, 0);
      }
      const controls =
        i === 0 || i === 2
          ? [8, 128].map((n) => ({
              ...valid[i],
              password: 'a'.repeat(n),
              ...(i === 2 ? { confirmPassword: 'a'.repeat(n) } : {}),
            }))
          : [valid[i]];
      for (const body of controls) {
        databaseCalls = hashCalls = 0;
        allowLoginLookup = i === 0;
        assert.equal(
          (await handler(jsonRequest(body))).status,
          503,
          'Sentinela deliberada deve interromper somente depois da validação.',
        );
        assert.equal(databaseCalls, i === 2 ? 0 : 1);
        assert.equal(
          hashCalls,
          i === 0 || i === 2 ? 1 : 0,
          'Controle válido de login/cadastro deve acionar o scrypt instrumentado.',
        );
        allowLoginLookup = false;
      }
    }
  } finally {
    if (previousMode === undefined)
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', previousMode);
    if (previousDb)
      Object.defineProperty(globalThis, 'portalPrisma', previousDb);
    else Reflect.deleteProperty(globalThis, 'portalPrisma');
    allowLoginLookup = false;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
