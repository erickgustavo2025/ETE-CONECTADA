import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { hashPassword } from '../../src/lib/password';

test('titular altera a senha e precisa entrar novamente', async ({ page }) => {
  const env = await openTestEnvironment({ http: true });
  const before = 'ContaFicticiaAntiga#24';
  const next = 'ContaFicticiaNova#24';
  const email = 'conta-ficticia@example.invalid';
  try {
    const account = await env.db.account.create({
      data: {
        role: 'student',
        status: 'active',
        email,
        passwordHash: await hashPassword(before),
        student: {
          create: {
            fullName: 'Pessoa Fictícia',
            birthDate: new Date('2000-01-01'),
          },
        },
      },
    });
    const token = randomBytes(32).toString('base64url');
    await env.db.session.create({
      data: {
        accountId: account.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const api = env.base + '/api/conta/senha';
    const fields = {
      currentPassword: before,
      newPassword: next,
      confirmPassword: next,
    };
    const anonymous = await page.request.post(api, {
      data: fields,
      headers: { origin: env.base },
    });
    expect(anonymous.status()).toBe(401);
    await page
      .context()
      .addCookies([
        { name: 'ete_portal_session', value: token, url: env.base },
      ]);
    const foreign = await page.request.post(api, {
      data: fields,
      headers: { origin: 'https://outro-site.example.invalid' },
    });
    expect(foreign.status()).toBe(403);
    const injected = await page.request.post(api, {
      data: { ...fields, accountId: account.id },
      headers: { origin: env.base },
    });
    expect(injected.status()).toBe(422);
    expect(await env.db.accountSecurityEvent.count()).toBe(0);

    await page.goto(env.base);
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await page.getByRole('link', { name: 'Minha conta' }).click();
    await expect(
      page.getByRole('heading', { name: 'Minha conta' }),
    ).toBeVisible();
    await page
      .getByLabel('Senha atual', { exact: true })
      .fill('Senha Fictícia Errada');
    await page.getByLabel('Nova senha', { exact: true }).fill(next);
    await page.getByLabel('Repita a nova senha', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(
      page.getByRole('region', { name: 'Alterar senha' }).getByRole('alert'),
    ).toContainText('A senha atual está incorreta');

    await page.getByLabel('Senha atual', { exact: true }).fill(before);
    const [changed] = await Promise.all([
      page.waitForResponse((response) => response.url() === api),
      page.getByRole('button', { name: 'Salvar nova senha' }).click(),
    ]);
    expect(changed.status()).toBe(200);
    expect(changed.headers()['cache-control']).toContain('no-store');
    await expect(
      page.getByRole('region', { name: 'Minha conta' }).getByRole('status'),
    ).toContainText('Senha alterada');
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'ete_portal_session',
      ),
    ).toBe(false);
    await page.getByRole('link', { name: 'Ir para o login' }).click();
    await expect(page).toHaveURL(/\/login$/);

    const login = env.base + '/api/login';
    const previous = await page.request.post(login, {
      data: { identifier: email, password: before },
      headers: { origin: env.base },
    });
    expect(previous.status()).toBe(401);
    const current = await page.request.post(login, {
      data: { identifier: email, password: next },
      headers: { origin: env.base },
    });
    expect(current.status()).toBe(200);
    expect(await env.db.accountSecurityEvent.count()).toBe(1);
  } finally {
    await env.close();
  }
});
