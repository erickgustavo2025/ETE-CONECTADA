import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { requestAccountEmailChange } from '../../src/lib/account-email-change';
import { hashPassword } from '../../src/lib/password';
import { getDb } from '../../src/lib/db';

test('titular confirma o novo e-mail sem revelar o link e entra com o contato novo', async ({
  page,
}) => {
  const env = await openTestEnvironment({ http: true });
  const password = 'Senha Fictícia#2026';
  const previous = 'antes@example.invalid';
  const next = 'novo@example.invalid';
  try {
    const account = await env.db.account.create({
      data: {
        status: 'active',
        email: previous,
        passwordHash: await hashPassword(password),
        student: {
          create: {
            fullName: 'Pessoa Fictícia',
            birthDate: new Date('2000-01-01'),
          },
        },
      },
    });
    const token = randomBytes(32).toString('base64url');
    const sessionHash = createHash('sha256').update(token).digest('hex');
    await env.db.session.create({
      data: {
        accountId: account.id,
        tokenHash: sessionHash,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    await page
      .context()
      .addCookies([
        { name: 'ete_portal_session', value: token, url: env.base },
      ]);
    await page.goto(env.base + '/conta');
    const emailForm = page.getByRole('region', { name: 'Alterar e-mail' });
    await expect(emailForm.getByText(previous)).toBeVisible();
    await emailForm.getByLabel('Novo e-mail').fill(next);
    await emailForm.getByLabel('Senha atual').fill(password);
    const [unavailable] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith('/api/conta/email'),
      ),
      emailForm
        .getByRole('button', { name: 'Enviar link de confirmação' })
        .click(),
    ]);
    expect(unavailable.status()).toBe(503);
    expect(await unavailable.text()).not.toContain(next);
    await expect(emailForm.getByRole('alert')).toContainText(
      'Envio de e-mail indisponível',
    );
    expect(await env.db.accountEmailChange.count()).toBe(0);

    // Teste isolado da chegada do link. O ensaio SMTP cobre o envio do mesmo modelo.
    const pending = await requestAccountEmailChange(
      getDb(),
      sessionHash,
      {
        currentPassword: password,
        newEmail: next,
      },
      env.base,
    );
    if (!pending) throw new Error('Pendência sintética indisponível.');

    await page.goto(pending.confirmationLink);
    await expect(page).toHaveURL(env.base + '/confirmar-novo-email');
    const form = page.getByRole('region', { name: 'Confirmar novo e-mail' });
    expect(
      (await env.db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .email,
    ).toBe(previous);
    const [confirmed] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith('/api/conta/email/confirmar'),
      ),
      form.getByRole('button', { name: 'Confirmar novo e-mail' }).click(),
    ]);
    expect(confirmed.status()).toBe(200);
    expect(confirmed.headers()['cache-control']).toContain('no-store');
    expect(await confirmed.json()).toEqual({ result: 'changed' });
    await expect(form.getByRole('status')).toContainText('E-mail alterado');
    await form.getByRole('link', { name: 'Ir para o login' }).click();
    await expect(page).toHaveURL(/\/login$/);

    const login = env.base + '/api/login';
    const previousLogin = await page.request.post(login, {
      data: { identifier: previous, password },
      headers: { origin: env.base },
    });
    expect(previousLogin.status()).toBe(401);
    const newLogin = await page.request.post(login, {
      data: { identifier: next, password },
      headers: { origin: env.base },
    });
    expect(newLogin.status()).toBe(200);
    expect(await env.db.accountSecurityEvent.count()).toBe(1);
    expect(await env.db.accountEmailChange.count()).toBe(0);
  } finally {
    await env.close();
  }
});
