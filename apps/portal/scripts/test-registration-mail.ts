import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { verifyPassword } from '../src/lib/password';

async function main() {
  const savedFetch = globalThis.fetch;
  const keys = [
    'NODE_ENV',
    'PORTAL_PUBLIC_URL',
    'RESEND_API_KEY',
    'EMAIL_FROM',
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  const environment = await openTestEnvironment();
  const { db } = environment;
  let studentId: string | undefined;
  const origin = 'https://portal.example.invalid';
  const email = `mail-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
  const password = randomBytes(20).toString('base64url');
  const input = {
    schoolRegistration: `0${randomInt(10000, 99999)}`,
    birthDate: '2008-01-15',
    parentName: 'Filiação Fictícia Um',
    cpf: '52998224725',
    email,
    password,
    confirmPassword: password,
  };
  const messages: Array<{ to: string[]; html: string }> = [];
  let provider: number | 'network' | 'timeout' = 503;
  let aborted = false;
  try {
    Reflect.set(process.env, 'NODE_ENV', 'development');
    process.env.PORTAL_PUBLIC_URL = origin;
    process.env.RESEND_API_KEY = 'fixture-key';
    process.env.EMAIL_FROM = 'noreply@eteconectada.invalid';
    // Única fronteira simulada: transporte externo. Handler, admissão e banco são reais.
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init?.redirect, 'error');
      messages.push(JSON.parse(String(init?.body)));
      if (provider === 'network') throw new Error('fixture-network-error');
      if (provider === 'timeout')
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(init!.signal!.reason);
            },
            { once: true },
          );
        });
      return new Response('fixture-provider-private-body', {
        status: provider,
      });
    };
    const { POST } = await import('../src/app/api/registration/start/route');
    const { verifyAccount, RegistrationConflict } =
      await import('../src/lib/account-registration');
    const start = (changes = {}) =>
      POST(
        new Request(`${origin}/api/registration/start`, {
          method: 'POST',
          headers: {
            Origin: origin,
            Host: 'evil.invalid',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...input, ...changes }),
        }),
      );
    const student = await db.student.create({
      data: {
        schoolRegistration: input.schoolRegistration,
        birthDate: new Date(`${input.birthDate}T00:00:00Z`),
        fullName: 'Falhas de e-mail sintéticas',
        details: {
          create: {
            parentOne: input.parentName,
            parentageSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    studentId = student.id;
    const failure = async (changes = {}, status = 503) => {
      const response = await start(changes);
      assert.equal(response.status, status);
      // O handler de falha define cache; conflitos também recebem os headers do Next no teste HTTP.
      if (status === 503)
        assert.match(response.headers.get('cache-control')!, /no-store/);
      assert.equal(response.headers.get('set-cookie'), null);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['error']);
      assert.equal(JSON.stringify(body).includes(email), false);
      assert.equal(JSON.stringify(body).includes('fixture-'), false);
      return body;
    };
    for (const config of [
      { RESEND_API_KEY: 'fixture-key', EMAIL_FROM: '' },
      { RESEND_API_KEY: '', EMAIL_FROM: 'noreply@eteconectada.invalid' },
      { RESEND_API_KEY: ' ', EMAIL_FROM: ' ' },
    ]) {
      Object.assign(process.env, config);
      await failure();
      assert.equal(await db.account.count({ where: { studentId } }), 0);
      assert.equal(
        (await db.student.findUniqueOrThrow({ where: { id: studentId } })).cpf,
        null,
      );
    }
    assert.equal(messages.length, 0);
    process.env.RESEND_API_KEY = 'fixture-key';
    process.env.EMAIL_FROM = 'noreply@eteconectada.invalid';
    const rejected = await failure();
    const account = await db.account.findUniqueOrThrow({
      where: { studentId },
    });
    assert.equal(account.status, 'pending');
    assert.equal(account.email, email);
    assert.ok(await verifyPassword(password, account.passwordHash!));
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      0,
    );
    const hash = (token: string) =>
      createHash('sha256').update(token).digest('hex');
    const sentToken = () => {
      const match = messages.at(-1)!.html.match(/href="([^"]+)"/);
      assert.ok(match);
      const url = new URL(match[1]);
      assert.equal(url.origin, origin, 'Host forjado não escolhe o link.');
      return url.searchParams.get('token')!;
    };
    const first = sentToken();
    assert.equal(
      (
        await db.emailVerificationToken.findUniqueOrThrow({
          where: { tokenHash: hash(first) },
        })
      ).consumedAt,
      null,
    );
    assert.deepEqual(
      await failure({ email: `other-${email}` }, 409),
      await failure(
        { password: 'OutraSenha#123', confirmPassword: 'OutraSenha#123' },
        409,
      ),
    );
    assert.equal(
      messages.length,
      1,
      'Tentativa com outros dados não envia nem substitui a conta pendente.',
    );
    provider = 'network';
    assert.deepEqual(await failure(), rejected);
    const second = sentToken();
    assert.notEqual(second, first);
    await assert.rejects(verifyAccount(hash(first)), RegistrationConflict);
    provider = 'timeout';
    const keepAlive = setTimeout(() => {}, 10_000);
    try {
      assert.deepEqual(await failure(), rejected);
    } finally {
      clearTimeout(keepAlive);
    }
    assert.equal(aborted, true);
    const third = sentToken();
    await assert.rejects(verifyAccount(hash(second)), RegistrationConflict);
    provider = 200;
    const accepted = await start();
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { result: 'email_sent' });
    assert.equal(accepted.headers.get('set-cookie'), null);
    assert.equal(messages.length, 4);
    assert.ok(
      messages.every(
        (message) => message.to.length === 1 && message.to[0] === email,
      ),
    );
    const last = sentToken();
    assert.notEqual(last, third);
    await assert.rejects(verifyAccount(hash(third)), RegistrationConflict);
    const resumed = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert.equal(
      resumed.status,
      'pending',
      'Envio aceito ainda exige confirmação.',
    );
    assert.equal(resumed.email, account.email);
    assert.ok(await verifyPassword(password, resumed.passwordHash!));
    assert.equal(
      await db.emailVerificationToken.count({
        where: { accountId: account.id },
      }),
      1,
    );
    await verifyAccount(hash(last));
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .status,
      'active',
    );
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      0,
    );
    await assert.rejects(verifyAccount(hash(last)), RegistrationConflict);
    console.log(
      'OK: falhas de configuração/provedor/rede/timeout sem link público; pendência, retomada, destinatário, rotação de token e confirmação única preservados. Nenhum e-mail real.',
    );
  } finally {
    globalThis.fetch = savedFetch;
    keys.forEach((key, i) => {
      if (previous[i] === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, previous[i]);
    });
    {
      await environment.close();
    }
  }
}

main().catch(reportTestFailure);
