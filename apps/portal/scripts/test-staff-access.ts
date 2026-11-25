import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../src/lib/db';
import {
  completePasswordReset,
  requestPasswordReset,
} from '../src/lib/password-reset';
import { requestAccountEmailChange } from '../src/lib/account-email-change';
import { changeStaffAccess } from './staff-access';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  try {
    const sent = new Map<string, string>();
    const delivery = {
      origin: env.base,
      async send(email: string, url: string) {
        sent.set(email, url);
      },
    };
    const a = 'secretaria-a@eteconectada.invalid';
    const b = 'secretaria-b@eteconectada.invalid';
    const reason = 'Acesso fictício aprovado pela gestão';
    const invite = (email: string) =>
      changeStaffAccess(
        env.db,
        {
          action: 'invite',
          email,
          name: email === a ? 'Secretaria Fictícia A' : 'Secretaria Fictícia B',
          reason,
        },
        delivery,
      );
    const ticket = (email: string) => {
      const url = new URL(sent.get(email)!);
      assert.equal(url.origin, env.base);
      assert.equal(url.pathname, '/redefinir-senha');
      assert.equal(url.searchParams.get('convite'), '1');
      const token = new URLSearchParams(url.hash.slice(1)).get('token');
      assert.match(token ?? '', /^[A-Za-z0-9_-]{43}$/);
      return token!;
    };
    const password = randomBytes(18).toString('base64url');
    const post = (path: string, body: unknown, cookie?: string) =>
      fetch(env.base + path, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          origin: env.base,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    const confirm = (token: string) =>
      post('/api/password-reset/confirm', {
        token,
        password,
        confirmPassword: password,
      });
    const login = async (email: string) => {
      const result = await post('/api/login', { identifier: email, password });
      assert.equal(result.status, 200);
      return result.headers.get('set-cookie')!.split(';')[0];
    };

    await assert.rejects(
      changeStaffAccess(
        getDb(),
        {
          action: 'invite',
          email: a,
          name: 'Secretaria Fictícia',
          reason,
        },
        delivery,
      ),
      /credencial de manutenção/,
    );

    await invite(a);
    assert.equal(await env.db.student.count(), 0);
    const original = ticket(a);
    assert.equal(
      (await post('/api/login', { identifier: a, password })).status,
      401,
    );
    assert.equal(
      await env.db.passwordResetToken.count({ where: { tokenHash: original } }),
      0,
    );
    await requestPasswordReset(getDb(), a, {
      origin: env.base,
      async send() {
        assert.fail('Convite pendente não é recuperação pública.');
      },
    });
    await invite(a);
    const replacement = ticket(a);
    assert.notEqual(original, replacement);
    assert.equal((await confirm(original)).status, 400);
    assert.equal((await confirm(replacement)).status, 200);
    assert.equal((await confirm(replacement)).status, 400);
    await assert.rejects(invite(a), /acesso ativo/);

    await invite(b);
    const expired = ticket(b);
    const expiresAt = new Date(Date.now() - 1000);
    await env.db.passwordResetToken.updateMany({
      where: {
        tokenHash: createHash('sha256').update(expired).digest('hex'),
      },
      data: {
        createdAt: new Date(expiresAt.getTime() - 30 * 60_000),
        expiresAt,
      },
    });
    assert.equal((await confirm(expired)).status, 400);
    await invite(b);
    assert.equal((await confirm(ticket(b))).status, 200);

    const sessionA = await login(a);
    const anotherA = await login(a);
    const sessionB = await login(b);
    const studentOnly = await fetch(env.base + '/api/declaracao/solicitacoes', {
      headers: { cookie: sessionA },
    });
    assert.equal(studentOnly.status, 403);
    const history = (cookie: string) =>
      post('/api/secretaria/historico', { categoria: 'ACESSO' }, cookie);
    assert.equal((await history(sessionA)).status, 200);
    assert.equal((await history(sessionB)).status, 200);
    const sessionHash = createHash('sha256')
      .update(sessionA.split('=')[1])
      .digest('hex');
    await assert.rejects(
      requestAccountEmailChange(
        getDb(),
        sessionHash,
        {
          currentPassword: password,
          newEmail: 'outro@eteconectada.invalid',
        },
        env.base,
      ),
      { reason: 'staff-email' },
    );

    const account = await env.db.account.findUniqueOrThrow({
      where: { email: a },
    });
    await assert.rejects(
      getDb().staffAccessEvent.create({
        data: { accountId: account.id, action: 'STAFF_REVOKED', reason },
      }),
    );
    const resetLinks: string[] = [];
    await requestPasswordReset(getDb(), a, {
      origin: env.base,
      async send(_email, link) {
        resetLinks.push(link);
      },
    });
    assert.equal(resetLinks.length, 1);
    const resetToken = new URLSearchParams(
      new URL(resetLinks[0]).hash.slice(1),
    ).get('token');
    await changeStaffAccess(env.db, {
      action: 'revoke',
      email: a,
      reason: 'Saída fictícia da equipe',
    });
    assert.equal((await history(sessionA)).status, 401);
    assert.equal((await history(anotherA)).status, 401);
    assert.equal(
      await env.db.session.count({ where: { accountId: account.id } }),
      0,
    );
    assert.equal(
      await env.db.passwordResetToken.count({
        where: { accountId: account.id },
      }),
      0,
    );
    await assert.rejects(
      completePasswordReset(getDb(), {
        token: resetToken,
        password,
        confirmPassword: password,
      }),
      { reason: 'invalid' },
    );
    assert.equal(
      (await post('/api/login', { identifier: a, password })).status,
      401,
    );
    const response = await history(sessionB);
    assert.equal(response.status, 200);
    const events = (await response.json()).events;
    assert.ok(
      events.some(
        (row: { action: string; subject: string }) =>
          row.action === 'STAFF_REVOKED' &&
          row.subject === 'Secretaria Fictícia A',
      ),
    );
    assert.equal(
      (await env.db.account.findUniqueOrThrow({ where: { email: a } })).id,
      account.id,
    );
    await assert.rejects(
      env.db.staffAccessEvent.deleteMany({ where: { accountId: account.id } }),
    );
    console.log(
      'OK: convite único, reenvio, expiração, dois funcionários, permissões separadas, histórico e retirada com sessões revogadas.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
