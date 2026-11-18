import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';

test('login informa pausa temporária e volta a funcionar após a janela', async ({
  page,
  context,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const email = `limite-browser-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
  const password = randomBytes(24).toString('base64url');

  try {
    await db.student.create({
      data: {
        fullName: 'Aluno fictício de pausa de login',
        birthDate: new Date('2008-01-15'),
        account: {
          create: {
            email,
            status: 'active',
            passwordHash: await hashPassword(password),
          },
        },
      },
    });

    await page.goto(`${base}/login`);
    for (let n = 0; n < 10; n++) {
      const response = await context.request.post(`${base}/api/login`, {
        headers: { Origin: base },
        data: { identifier: email, password: 'SenhaIncorretaFicticia#123' },
      });
      expect(response.status()).toBe(401);
    }
    await page.getByLabel('CPF ou e-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    const button = page.getByRole('button', { name: 'Entrar no portal' });
    const blocked = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/login',
    );
    await button.focus();
    await page.keyboard.press('Enter');
    expect((await blocked).status()).toBe(429);
    const notice = page.getByText(
      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      { exact: true },
    );
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(button).toBeEnabled();
    await expect(page).toHaveURL(`${base}/login`);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`limite-login-${width}.png`),
        fullPage: true,
      });
    }
    await db.$executeRaw`UPDATE access_attempt_buckets
      SET window_started_at = clock_timestamp() - interval '2 minutes',
          expires_at = clock_timestamp() - interval '1 minute'`;
    const accepted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/login',
    );
    await button.click();
    expect((await accepted).status()).toBe(200);
    await expect(page).not.toHaveURL(`${base}/login`);
  } finally {
    await environment.close();
  }
});
