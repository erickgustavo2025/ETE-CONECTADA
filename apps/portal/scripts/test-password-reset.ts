import assert from 'node:assert/strict';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { requestPasswordReset } from '../src/lib/password-reset';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { createVerifiedSession } from '../src/lib/session-record';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const email = `recovery-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
  const password = 'SenhaSintetica#123',
    nextPassword = 'NovaSenhaSintetica#456';
  const messages: Array<{ to: string; url: string }> = [];
  const delivery = {
    origin: base,
    async send(to: string, url: string) {
      messages.push({ to, url });
    },
  };
  const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  const post = (path: string, data: unknown, origin = base) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(data),
    });
  const reset = (token: string, changes = {}) =>
    post('/api/password-reset/confirm', {
      token,
      password: nextPassword,
      confirmPassword: nextPassword,
      ...changes,
    });
  const tokenFrom = (url: string) =>
    new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
  try {
    const response = await fetch(
      `${environment.base}/api/password-reset/request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: environment.base,
        },
        body: JSON.stringify({ email: 'recovery@eteconectada.invalid' }),
      },
    );
    assert.equal(
      response.status,
      200,
      'Recuperação deve aceitar a solicitação sem revelar se o e-mail existe.',
    );
    assert.deepEqual(Object.keys(await response.json()), ['message']);
    const originalHash = await hashPassword(password);
    const student = await db.student.create({
      data: {
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15'),
        fullName: 'Recuperação sintética',
        account: {
          create: { email, passwordHash: originalHash, status: 'active' },
        },
      },
      include: { account: true },
    });
    ids.push(student.id);
    const account = student.account!;
    const receipt = async (value: string) => {
      const r = await post('/api/password-reset/request', { email: value });
      return {
        status: r.status,
        body: await r.json(),
        cache: r.headers.get('cache-control'),
      };
    };
    assert.deepEqual(await receipt(email), await receipt(`missing-${email}`));
    for (const path of [
      '/api/password-reset/request',
      '/api/password-reset/confirm',
    ]) {
      assert.equal(
        (await post(path, { padding: 'a'.repeat(4096) })).status,
        413,
      );
      assert.equal((await post(path, [])).status, 400);
      assert.equal((await fetch(`${base}${path}`)).status, 405);
    }
    assert.equal(
      (
        await post(
          '/api/password-reset/request',
          { email },
          'https://wrong.invalid',
        )
      ).status,
      403,
    );
    const pendingStudent = await db.student.create({
      data: {
        birthDate: new Date('2008-01-15'),
        fullName: 'Conta pendente sintética',
        account: {
          create: {
            email: `pending-${email}`,
            status: 'pending',
            passwordHash: originalHash,
          },
        },
      },
      include: { account: true },
    });
    ids.push(pendingStudent.id);
    assert.deepEqual(await receipt(email), await receipt(`pending-${email}`));
    await requestPasswordReset(db, `pending-${email}`, delivery);
    await requestPasswordReset(db, `missing-${email}`, delivery);
    assert.equal(messages.length, 0);
    await Promise.all([
      requestPasswordReset(db, email.toUpperCase(), delivery),
      requestPasswordReset(db, email, delivery),
    ]);
    assert.equal(
      messages.length,
      1,
      'Pedidos concorrentes respeitam intervalo por conta.',
    );
    assert.equal(messages[0].to, email);
    const link = new URL(messages[0].url),
      token = tokenFrom(link.href);
    assert.equal(link.origin, base);
    assert.equal(link.search, '');
    assert.equal(token.length, 43);
    const stored = await db.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: hash(token) },
    });
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.equal(
      stored.expiresAt.getTime() - stored.createdAt.getTime(),
      30 * 60_000,
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await db.passwordResetToken.updateMany({
        where: { accountId: account.id },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      await requestPasswordReset(db, email, delivery);
    }
    assert.equal(
      messages.length,
      3,
      'No máximo três links ativos sem invalidar o primeiro.',
    );
    assert.equal(
      await db.passwordResetToken.count({ where: { accountId: account.id } }),
      3,
    );
    const login = await post('/api/login', { identifier: email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await reset(token, { password: 'curta', confirmPassword: 'curta' }))
        .status,
      400,
    );
    assert.equal(
      (await reset(token, { confirmPassword: 'OutraSenha#123' })).status,
      400,
    );
    assert.equal(
      (
        await post(
          '/api/password-reset/confirm',
          { token, password: nextPassword, confirmPassword: nextPassword },
          'https://wrong.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .passwordHash,
      originalHash,
    );
    await db.emailVerificationToken.create({
      data: {
        tokenHash: hash('legacy-fixture'),
        accountId: account.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    // Falha depois de alterar senha/revogar sessões deve desfazer a transação inteira.
    await db.$executeRaw`CREATE FUNCTION ec059_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$`;
    try {
      await db.$executeRaw`CREATE TRIGGER ec059_reject_delete BEFORE DELETE ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION ec059_reject_delete()`;
      assert.equal((await reset(token)).status, 503);
      assert.equal(
        (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
          .passwordHash,
        originalHash,
      );
      assert.equal(
        await db.session.count({ where: { accountId: account.id } }),
        1,
      );
      assert.equal(
        await db.emailVerificationToken.count({
          where: { accountId: account.id },
        }),
        1,
      );
      assert.equal(
        await db.passwordResetToken.count({ where: { accountId: account.id } }),
        3,
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS ec059_reject_delete ON password_reset_tokens`;
      await db.$executeRaw`DROP FUNCTION ec059_reject_delete()`;
    }
    const results = await Promise.all([reset(token), reset(token)]);
    assert.deepEqual(
      results.map((r) => r.status).sort(),
      [200, 400],
      'Só uma troca concorrente pode vencer.',
    );
    const result = results.find((r) => r.status === 200)!;
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { result: 'changed' });
    assert.equal(
      result.headers.get('set-cookie'),
      null,
      'Redefinir não autentica automaticamente.',
    );
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      0,
    );
    assert.equal(
      await db.passwordResetToken.count({ where: { accountId: account.id } }),
      0,
    );
    const changed = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert.equal(
      await verifyPassword(nextPassword, changed.passwordHash!),
      true,
    );
    assert.ok(changed.passwordResetAt);
    assert.equal(
      await db.emailVerificationToken.count({
        where: { accountId: account.id },
      }),
      0,
    );
    for (const message of messages)
      assert.equal((await reset(tokenFrom(message.url))).status, 400);
    assert.equal(
      await createVerifiedSession(
        db,
        account.id,
        originalHash,
        hash(randomBytes(32).toString('hex')),
        new Date(Date.now() + 60_000),
      ),
      false,
      'Login verificado antes do reset não cria sessão depois dele.',
    );
    assert.equal(
      (
        await fetch(`${base}/`, {
          headers: { Cookie: cookie },
          redirect: 'manual',
        })
      ).status,
      307,
    );
    assert.equal((await reset(token)).status, 400);
    assert.equal(
      (await post('/api/login', { identifier: email, password })).status,
      401,
    );
    assert.equal(
      (await post('/api/login', { identifier: email, password: nextPassword }))
        .status,
      200,
    );
    await requestPasswordReset(db, email, delivery);
    let currentToken = tokenFrom(messages.at(-1)!.url);
    await db.passwordResetToken.update({
      where: { tokenHash: hash(currentToken) },
      data: {
        createdAt: new Date(Date.now() - 31 * 60_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    assert.equal((await reset(currentToken)).status, 400);
    await requestPasswordReset(db, email, delivery);
    currentToken = tokenFrom(messages.at(-1)!.url);
    await db.account.update({
      where: { id: account.id },
      data: { email: `changed-${email}` },
    });
    assert.equal(
      (await reset(currentToken)).status,
      400,
      'Link vinculado ao contato anterior não muda senha.',
    );
    await db.account.update({
      where: { id: account.id },
      data: { email, status: 'pending' },
    });
    assert.equal(
      (await reset(currentToken)).status,
      400,
      'Conta não ativa não pode ser recuperada.',
    );
    await db.account.update({
      where: { id: account.id },
      data: {
        status: 'active',
        passwordHash: await hashPassword('SenhaCorrigida#789'),
      },
    });
    assert.equal(
      (await reset(currentToken)).status,
      400,
      'Mudança de credenciais invalida link anterior.',
    );
    const previousMessages = messages.length;
    await db.account.update({
      where: { id: pendingStudent.account!.id },
      data: { status: 'active', email: email.toUpperCase() },
    });
    await requestPasswordReset(db, email, delivery);
    assert.equal(
      messages.length,
      previousMessages,
      'Duplicidade antiga por caixa exige conferência.',
    );
    await db.account.update({
      where: { id: pendingStudent.account!.id },
      data: { email: `staff-${email}`, role: 'secretary' },
    });
    await requestPasswordReset(db, `staff-${email}`, delivery);
    assert.equal(
      (await reset(tokenFrom(messages.at(-1)!.url))).status,
      200,
      'Secretaria ativa também pode recuperar pelo e-mail confirmado.',
    );
    console.log(
      'OK: resposta genérica, transporte simulado, segredo apenas em hash, intervalo, uso único, senha atualizada, sessões revogadas e login concorrente antigo recusado.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
