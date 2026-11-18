import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailTransport, MailDeliveryError } from '../src/lib/email-transport';
import { verificationDelivery } from '../src/lib/verification-delivery';
import { recoveryMailer } from '../src/lib/recovery-mail';

const settings = {
  NODE_ENV: 'development',
  RESEND_API_KEY: 'fixture-key',
  EMAIL_FROM: 'noreply@eteconectada.invalid',
  PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
};
const token = 'A'.repeat(43);
const recipient = 'aluno@eteconectada.invalid';

test('e-mail: somente desenvolvimento sem provedor oferece link de demonstração', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw new Error('Nenhum envio esperado.');
  };
  for (const NODE_ENV of ['development', 'test', 'production', undefined]) {
    for (const credentials of [
      { RESEND_API_KEY: '', EMAIL_FROM: '' },
      { RESEND_API_KEY: 'fixture-key', EMAIL_FROM: '' },
      { RESEND_API_KEY: '', EMAIL_FROM: settings.EMAIL_FROM },
      { RESEND_API_KEY: ' ', EMAIL_FROM: ' ' },
    ]) {
      const env = { ...settings, ...credentials, NODE_ENV };
      const delivery = verificationDelivery(token, env, fetcher);
      if (
        NODE_ENV === 'development' &&
        !credentials.RESEND_API_KEY &&
        !credentials.EMAIL_FROM
      ) {
        assert.ok(delivery);
        const result = await delivery.send(recipient);
        assert.deepEqual(result, {
          result: 'dev_link',
          verificationUrl: `${settings.PORTAL_PUBLIC_URL}/confirmar-email?token=${token}`,
        });
      } else assert.equal(delivery, null);
    }
  }
  assert.equal(calls, 0);
  const relative = verificationDelivery(
    token,
    { NODE_ENV: 'development' },
    fetcher,
  )!;
  assert.deepEqual(await relative.send(recipient), {
    result: 'dev_link',
    verificationUrl: `/confirmar-email?token=${token}`,
  });
});

test('e-mail: origem inválida ou HTTP fora de desenvolvimento recusa configuração antes do envio', () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    for (const PORTAL_PUBLIC_URL of [
      undefined,
      '',
      'https://portal.invalid/path',
      'https://user:secret@portal.invalid',
      'http://untrusted.invalid',
    ]) {
      const env = { ...settings, NODE_ENV, PORTAL_PUBLIC_URL };
      assert.equal(emailTransport(env), null);
      assert.equal(verificationDelivery(token, env), null);
      assert.equal(recoveryMailer(env), null);
    }
    const env = {
      ...settings,
      NODE_ENV,
      PORTAL_PUBLIC_URL: 'http://localhost:3002',
    };
    assert.equal(emailTransport(env) !== null, NODE_ENV === 'development');
    assert.equal(
      verificationDelivery(token, env) !== null,
      NODE_ENV === 'development',
    );
  }
});

test('e-mail: mensagem aceita pelo provedor não devolve token, link ou destinatário', async () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    const sent: Array<{ url: string; init: RequestInit }> = [];
    const delivery = verificationDelivery(
      token,
      { ...settings, NODE_ENV },
      async (url, init) => {
        sent.push({ url, init });
        return new Response('{"id":"fixture"}', { status: 200 });
      },
    )!;
    assert.deepEqual(await delivery.send(recipient), { result: 'email_sent' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    assert.equal(sent[0].init.method, 'POST');
    assert.equal(sent[0].init.redirect, 'error');
    assert.equal(sent[0].init.credentials, 'omit');
    const message = JSON.parse(String(sent[0].init.body));
    assert.deepEqual(message.to, [recipient]);
    assert.equal(message.from, settings.EMAIL_FROM);
    assert.ok(
      message.html.includes(
        `${settings.PORTAL_PUBLIC_URL}/confirmar-email?token=${token}`,
      ),
    );
  }
});

test('e-mail: rejeição, redirect e erro de rede são opacos e não repetem o envio', async () => {
  const privateMessage = `${settings.RESEND_API_KEY} ${recipient} ${token}`;
  for (const status of [
    301,
    302,
    307,
    400,
    401,
    429,
    500,
    503,
    'network',
    'abort',
  ] as const) {
    let calls = 0;
    const delivery = verificationDelivery(token, settings, async () => {
      calls++;
      if (status === 'network' || status === 'abort')
        throw new Error(privateMessage, { cause: privateMessage });
      return new Response(privateMessage, {
        status,
        headers: { Location: 'https://evil.invalid' },
      });
    })!;
    await assert.rejects(delivery.send(recipient), (error: unknown) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(
        error.message,
        'Não foi possível enviar a mensagem agora. Tente novamente.',
      );
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes(privateMessage), false);
      return true;
    });
    assert.equal(calls, 1, 'Não repetir um envio de resultado incerto.');
  }
});

test('e-mail: provedor sem resposta é abortado no prazo, sem fallback ou repetição', async () => {
  let calls = 0,
    aborted = false;
  const keepAlive = setTimeout(() => {}, 10_000);
  try {
    const delivery = verificationDelivery(
      token,
      settings,
      async (_url, init) => {
        calls++;
        const signal = init.signal!;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(signal.reason);
            },
            { once: true },
          );
        });
      },
    )!;
    await assert.rejects(delivery.send(recipient), MailDeliveryError);
    assert.equal(aborted, true);
    assert.equal(calls, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('e-mail: recuperação compartilha transporte, aviso não contém token e falhas não expõem o provedor', async () => {
  const sent: Array<{ html: string; to: string[] }> = [];
  const mailer = recoveryMailer(settings, async (_url, init) => {
    assert.equal(init.redirect, 'error');
    sent.push(JSON.parse(String(init.body)));
    return new Response(null, { status: 202 });
  })!;
  await mailer.send(
    recipient,
    `${settings.PORTAL_PUBLIC_URL}/redefinir-senha#token=${token}`,
  );
  await mailer.notify(recipient);
  assert.ok(sent[0].html.includes(`#token=${token}`));
  assert.equal(sent[1].html.includes(token), false);
  assert.deepEqual(
    sent.map((v) => v.to),
    [[recipient], [recipient]],
  );
  const failed = recoveryMailer(
    settings,
    async () => new Response(token, { status: 503 }),
  )!;
  await assert.rejects(failed.send(recipient, token), MailDeliveryError);
  await assert.rejects(failed.notify(recipient), MailDeliveryError);
});

const smtpSettings = {
  ...settings,
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'fixture-smtp',
  SMTP_PASSWORD: 'fixture-smtp-secret',
};

test('SMTP: configuração explícita não usa Resend nem link de demonstração quando incompleta', () => {
  for (const missing of [
    { SMTP_HOST: '' },
    { SMTP_HOST: 'http://smtp.example.invalid' },
    { SMTP_PORT: '587smtp' },
    { SMTP_PORT: '0' },
    { SMTP_USER: '' },
    { SMTP_PASSWORD: '' },
    { EMAIL_FROM: '' },
    { SMTP_TLS_MODE: 'plain' },
    { EMAIL_TRANSPORT: 'typo' },
  ]) {
    const env = { ...smtpSettings, ...missing };
    assert.equal(emailTransport(env), null);
    assert.equal(verificationDelivery(token, env), null);
    assert.equal(recoveryMailer(env), null);
  }

  const empty = {
    NODE_ENV: 'development',
    EMAIL_TRANSPORT: 'smtp',
  };
  assert.equal(verificationDelivery(token, empty), null);
  assert.equal(recoveryMailer(empty), null);
});

test('SMTP: cadastro e recuperação aceitam o mesmo transporte configurado', () => {
  const env = { ...smtpSettings, RESEND_API_KEY: '' };
  assert.equal(emailTransport(env)?.origin, settings.PORTAL_PUBLIC_URL);
  assert.ok(verificationDelivery(token, env));
  assert.ok(recoveryMailer(env));
});
