import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  const ids: string[] = [];
  const sessions: Record<string, { cookie: string; hash: string }> = {};
  try {
    assert.equal(await db.student.count(), 0, 'Exige banco novo identificado.');
    for (const role of ['student', 'secretary'] as const) {
      const student = await db.student.create({
        data: {
          fullName: 'Pessoa Fictícia Origem',
          birthDate: new Date('2000-01-01'),
          account: {
            create: {
              role,
              status: 'active',
              email: `origin-${randomUUID()}@eteconectada.invalid`,
              passwordHash: 'hash-ficticio-sem-login',
            },
          },
        },
        include: { account: true },
      });
      ids.push(student.id);
      const token = randomBytes(32).toString('base64url');
      const hash = createHash('sha256').update(token).digest('hex');
      await db.session.create({
        data: {
          accountId: student.account!.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      sessions[role] = { cookie: `ete_portal_session=${token}`, hash };
    }
    const routes = [
      '/api/login',
      '/api/logout',
      '/api/registration/check',
      '/api/registration/start',
      '/api/registration/verify',
      '/api/password-reset/request',
      '/api/password-reset/confirm',
      '/api/declaracao/solicitacoes',
      '/api/secretaria/alunos',
      '/api/secretaria/calendarios',
      '/api/secretaria/declaracao',
      '/api/secretaria/declaracoes',
      '/api/secretaria/importacao',
      '/api/secretaria/solicitacoes',
    ];
    const state = async () => ({
      accounts: await db.account.findMany({
        where: { studentId: { in: ids } },
        orderBy: { id: 'asc' },
      }),
      sessions: await db.session.findMany({ orderBy: { tokenHash: 'asc' } }),
      requests: await db.declarationRequest.count(),
      previews: await db.sheetImportPreview.count(),
      attempts: await db.accessAttemptBucket.count(),
    });
    const before = await state();
    for (const route of routes) {
      for (const origin of [undefined, 'null', 'https://evil.invalid']) {
        const response = await fetch(base + route, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie:
              sessions[
                route.startsWith('/api/secretaria/') ? 'secretary' : 'student'
              ].cookie,
            ...(origin ? { Origin: origin } : {}),
          },
          body: '{}',
        });
        assert.equal(
          response.status,
          403,
          `${route}: origem ausente/externa deve ser negada.`,
        );
        assert.equal(response.headers.get('set-cookie'), null);
      }
    }
    assert.deepEqual(
      await state(),
      before,
      'Rejeição não altera contas, sessões, pedidos, prévias ou limites.',
    );
    const forgedHeaders: Record<string, string>[] = [
      {
        Origin: 'https://evil.invalid',
        Host: 'evil.invalid',
        'X-Forwarded-Host': 'evil.invalid',
      },
      { Origin: base, 'Sec-Fetch-Site': 'cross-site' },
    ];
    for (const headers of forgedHeaders) {
      const response = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: '{}',
      });
      assert.equal(response.status, 403);
    }
    const proxy = await fetch(base + '/api/login', {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        Host: 'proxy-interno.invalid',
        'X-Forwarded-Host': 'evil.invalid',
      },
      body: '{}',
    });
    assert.equal(
      proxy.status,
      400,
      'Origem configurada admite proxy e ignora forwarded adulterado; corpo continua inválido.',
    );
    const logout = await fetch(base + '/api/logout', {
      method: 'POST',
      headers: { Origin: base, Cookie: sessions.student.cookie },
    });
    assert.equal(logout.status, 200);
    assert.equal(
      await db.session.count({ where: { tokenHash: sessions.student.hash } }),
      0,
    );
    assert.equal(
      await db.session.count({ where: { tokenHash: sessions.secretary.hash } }),
      1,
    );
    console.log(
      'OK: matriz de14POSTs recusa origem ausente/null/externa sem efeitos; Host/forwarded não mudam confiança; proxy e logout legítimos preservados.',
    );
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await env.close();
    }
  }
}
main().catch(reportTestFailure);
