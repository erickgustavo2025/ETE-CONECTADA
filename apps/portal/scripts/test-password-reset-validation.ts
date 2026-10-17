import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resetOrigin,
  resetProblem,
  validResetToken,
} from '../src/lib/password-reset-input';
import { recoveryMailer } from '../src/lib/recovery-mail';

test('recuperação: origem configurada, token e senha limitados sem normalizar segredo', () => {
  for (const origin of [
    'https://portal.example.invalid',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://[::1]:3002',
  ])
    assert.equal(resetOrigin(origin), origin);
  for (const value of [
    undefined,
    '',
    'http://school.invalid',
    'https://user:password@portal.invalid',
    'https://portal.invalid/path',
    'https://portal.invalid?x=y',
    'https://portal.invalid#token=x',
    'javascript:alert(1)',
  ])
    assert.equal(resetOrigin(value), null);
  assert.equal(validResetToken('A'.repeat(43)), true);
  for (const value of [
    undefined,
    [],
    'A'.repeat(42),
    'A'.repeat(44),
    ' A'.repeat(22),
    '/'.repeat(43),
  ])
    assert.equal(validResetToken(value), false);
  const input = {
    token: 'A'.repeat(43),
    password: ' '.repeat(8),
    confirmPassword: ' '.repeat(8),
  };
  assert.equal(resetProblem(input), null);
  assert.equal(
    resetProblem({
      ...input,
      password: 'a'.repeat(128),
      confirmPassword: 'a'.repeat(128),
    }),
    null,
  );
  for (const value of ['curta', 'a'.repeat(129), null, {}])
    assert.equal(resetProblem({ ...input, password: value }), 'password');
  assert.equal(
    resetProblem({ ...input, confirmPassword: 'OutraSenha' }),
    'mismatch',
  );
});

test('recuperação: validação/origem/produção recusam antes do banco, sem link público', async () => {
  const previousMode = process.env.NODE_ENV;
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'portalPrisma');
  const env = ['RESEND_API_KEY', 'EMAIL_FROM', 'PORTAL_PUBLIC_URL'] as const;
  const previous = env.map((key) => process.env[key]);
  let calls = 0;
  try {
    Reflect.set(process.env, 'NODE_ENV', 'development');
    env.forEach((key) => {
      process.env[key] = '';
    });
    Object.defineProperty(globalThis, 'portalPrisma', {
      configurable: true,
      get() {
        calls++;
        throw new Error('sentinela');
      },
    });
    const request = (
      await import('../src/app/api/password-reset/request/route')
    ).POST;
    const confirm = (
      await import('../src/app/api/password-reset/confirm/route')
    ).POST;
    const url = 'http://127.0.0.1:4000/api/test';
    const req = (body: unknown, origin = 'http://127.0.0.1:4000') =>
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(body),
      });
    for (const handler of [request, confirm]) {
      for (const body of [
        null,
        [],
        {},
        { token: [] },
        { padding: 'a'.repeat(4096) },
      ]) {
        assert.equal(
          (await handler(req(body))).status,
          JSON.stringify(body).length > 4096 ? 413 : 400,
        );
      }
      assert.equal(
        (await handler(req({}, 'https://wrong.invalid'))).status,
        403,
      );
    }
    assert.equal(calls, 0);
    const receipt = await request(req({ email: 'test@eteconectada.invalid' }));
    assert.equal(
      receipt.status,
      503,
      'Falha da admissão não deve ignorar o limite e aceitar a solicitação.',
    );
    assert.deepEqual(Object.keys(await receipt.json()), ['error']);
    assert.equal(calls, 1);
    assert.equal(
      (
        await confirm(
          req({
            token: 'A'.repeat(43),
            password: 'Senha#123',
            confirmPassword: 'Senha#123',
          }),
        )
      ).status,
      503,
    );
    assert.equal(
      calls,
      2,
      'Controles positivos alcançam a admissão somente após validar.',
    );
    Reflect.set(process.env, 'NODE_ENV', 'production');
    assert.equal((await request(req({}))).status, 503);
    assert.equal((await confirm(req({}))).status, 503);
    assert.equal(calls, 2);
  } finally {
    if (previousMode === undefined)
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', previousMode);
    env.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    if (saved) Object.defineProperty(globalThis, 'portalPrisma', saved);
    else Reflect.deleteProperty(globalThis, 'portalPrisma');
  }
});

test('recuperação: Resend simulado usa destinatário fixado e aviso sem senha; falha é tratável', async () => {
  const env = ['RESEND_API_KEY', 'EMAIL_FROM', 'PORTAL_PUBLIC_URL'] as const;
  const previous = env.map((key) => process.env[key]),
    originalFetch = globalThis.fetch;
  const sent: Array<{
    from: string;
    to: string[];
    subject: string;
    html: string;
  }> = [];
  try {
    process.env.RESEND_API_KEY = 'fixture-key';
    process.env.EMAIL_FROM = 'noreply@eteconectada.invalid';
    process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options?.method, 'POST');
      sent.push(JSON.parse(String(options?.body)));
      return new Response('{}', { status: 200 });
    };
    const mailer = recoveryMailer()!;
    await mailer.send(
      'target@eteconectada.invalid',
      `${mailer.origin}/redefinir-senha#token=${'A'.repeat(43)}`,
    );
    await mailer.notify('target@eteconectada.invalid');
    assert.deepEqual(sent[0].to, ['target@eteconectada.invalid']);
    assert.ok(sent[0].html.includes('#token='));
    assert.ok(!sent[1].html.includes('#token='));
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(mailer.notify('target@eteconectada.invalid'));
    process.env.PORTAL_PUBLIC_URL = 'http://untrusted.invalid';
    assert.equal(recoveryMailer(), null);
  } finally {
    globalThis.fetch = originalFetch;
    env.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
