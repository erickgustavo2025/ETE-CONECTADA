import { test, expect } from '@playwright/test';
import { randomBytes, createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from '../../src/lib/password';
import { requestPasswordReset } from '../../src/lib/password-reset';
import { changeStaffAccess } from '../../scripts/staff-access';

test('convite da secretaria define a primeira senha e abre o painel', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const savedPreview = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  let environment: Awaited<ReturnType<typeof openTestEnvironment>> | undefined;
  const email = `staff-browser-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
  const password = 'SenhaDoConvite#456';
  let link = '';
  try {
    environment = await openTestEnvironment({ http: true });
    const { db, base } = environment;
    await changeStaffAccess(
      db,
      {
        action: 'invite',
        email,
        name: 'Secretaria Fictícia de Navegador',
        reason: 'Acesso aprovado no ensaio fictício',
      },
      {
        origin: base,
        async send(to, url) {
          expect(to).toBe(email);
          link = url;
        },
      },
    );
    expect(link).toBeTruthy();
    await page.goto(link);
    await expect(page).toHaveURL(`${base}/redefinir-senha?convite=1`);
    await expect(
      page.getByRole('heading', { name: 'Defina sua senha da secretaria' }),
    ).toBeVisible();
    await page.getByLabel('Nova senha', { exact: true }).fill(password);
    await page.getByLabel('Confirme a senha').fill(password);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(
      page.getByRole('heading', { name: 'Conta ativada' }),
    ).toBeFocused();
    await page.goto(`${base}/login`);
    await page.getByLabel('CPF ou e-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    await expect(page).toHaveURL(`${base}/`);
    await page.goto(`${base}/secretaria/historico`);
    await expect(
      page.getByRole('heading', { name: 'Histórico de ações', exact: true }),
    ).toBeVisible();
  } finally {
    if (savedPreview === undefined)
      delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = savedPreview;
    await environment?.close();
  }
});

test('recuperação protege o link, trata resposta perdida e encerra sessões antigas', async ({
  page,
  context,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const email = `recovery-browser-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
  const password = 'SenhaInicial#123',
    nextPassword = 'NovaSenha#456',
    finalPassword = 'SenhaFinal#789';
  let link = '';
  const delivery = {
    origin: base,
    async send(to: string, url: string) {
      expect(to).toBe(email);
      link = url;
    },
  };
  try {
    const student = await db.student.create({
      data: {
        birthDate: new Date('2008-01-15'),
        fullName: 'Recuperação de navegador sintética',
        account: {
          create: {
            email,
            passwordHash: await hashPassword(password),
            status: 'active',
          },
        },
      },
      include: { account: true },
    });

    const accountId = student.account!.id;
    await page.goto(`${base}/login`);
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recuperar acesso' }),
    ).toBeVisible();
    const input = page.getByLabel('E-mail da conta');
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.fill(email);
    await page.route(
      '**/api/password-reset/request',
      (route) => route.abort('failed'),
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(
      page.getByText(/Confira a conexão e tente novamente/),
    ).toBeVisible();
    await expect(input).toHaveValue(email);
    const receipt = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/password-reset/request',
    );
    await page.getByRole('button', { name: 'Enviar link' }).click();
    const received = await receipt;
    expect(received.status()).toBe(200);
    expect(Object.keys(await received.json())).toEqual(['message']);
    await expect(page.getByText(/Se houver uma conta ativa/)).toBeVisible();
    // Transporte substituído no serviço, sem configurar Resend nem devolver segredo na API.
    await requestPasswordReset(db, email, delivery);
    expect(link).toBeTruthy();
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
      'token',
    )!;
    const scanner = await context.request.get(`${base}/redefinir-senha`);
    expect(scanner.status()).toBe(200);
    expect(await db.passwordResetToken.count({ where: { accountId } })).toBe(1);
    expect(
      (
        await context.request.post(`${base}/api/login`, {
          headers: { Origin: base },
          data: { identifier: email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(link);
    await expect(page).toHaveURL(`${base}/redefinir-senha`);
    expect((await page.content()).includes(token)).toBe(false);
    await page.getByLabel('Nova senha', { exact: true }).fill(nextPassword);
    await page.getByLabel('Confirme a senha').fill('SenhaDiferente#123');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByLabel('Confirme a senha')).toBeFocused();
    await expect(page.locator('#recovery-error')).toContainText('iguais');
    await page.getByLabel('Confirme a senha').fill(nextPassword);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`recuperacao-${width}.png`),
        fullPage: true,
      });
    }
    await page.route(
      '**/api/password-reset/confirm',
      async (route) => {
        const applied = await route.fetch();
        expect(applied.status()).toBe(200);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(
      page.getByText(/Não foi possível confirmar a alteração/),
    ).toBeVisible();
    expect(
      await verifyPassword(
        nextPassword,
        (await db.account.findUniqueOrThrow({ where: { id: accountId } }))
          .passwordHash!,
      ),
    ).toBe(true);
    expect(await db.session.count({ where: { accountId } })).toBe(0);
    await page.goto(`${base}/`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('CPF ou e-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Confira os dados',
    );
    await page.getByLabel('Senha', { exact: true }).fill(nextPassword);
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    await expect(page).toHaveURL(`${base}/`);
    await requestPasswordReset(db, email, delivery);
    const expiredToken = new URLSearchParams(new URL(link).hash.slice(1)).get(
      'token',
    )!;
    await db.passwordResetToken.update({
      where: {
        tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
      },
      data: {
        createdAt: new Date(Date.now() - 31 * 60_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill(finalPassword);
    await page.getByLabel('Confirme a senha').fill(finalPassword);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(
      page.getByText(/Este link é inválido ou expirou/),
    ).toBeVisible();
    // Uma resposta atrasada do link anterior não substitui o novo link na mesma aba.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      '**/api/password-reset/confirm',
      async (route) => {
        await gate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: 'changed' }),
        });
      },
      { times: 1 },
    );
    const pendingRequest = page.waitForRequest(
      (r) => new URL(r.url()).pathname === '/api/password-reset/confirm',
    );
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await pendingRequest;
    await page.goto(`${base}/redefinir-senha#token=invalid`);
    await expect(
      page.getByText(/Este link é inválido\. Solicite/),
    ).toBeVisible();
    const delayedResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/password-reset/confirm',
    );
    release();
    await delayedResponse;
    await expect(
      page.getByText(/Este link é inválido\. Solicite/),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Salvar nova senha' }),
    ).toHaveCount(0);
    await requestPasswordReset(db, email, delivery);
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill(finalPassword);
    await page.getByLabel('Confirme a senha').fill(finalPassword);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(
      page.getByRole('heading', { name: 'Senha atualizada' }),
    ).toBeFocused();
    await expect(page).toHaveURL(`${base}/redefinir-senha`);
    await page.getByRole('link', { name: 'Voltar ao login' }).click();
    await expect(
      page.getByRole('heading', { name: 'Acesso ao portal' }),
    ).toBeVisible();
  } finally {
    await environment.close();
  }
});
