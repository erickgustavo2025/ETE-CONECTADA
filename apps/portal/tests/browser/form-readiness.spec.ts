import { test, expect } from '@playwright/test';

test('formulários aguardam os scripts sem perder dados ou enviar POST nativo', async ({
  browser,
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST')
      posts.push(new URL(request.url()).pathname);
  });
  let release = () => {};
  try {
    const flows = [
      {
        path: '/cadastro',
        label: 'Matrícula',
        value: '87654321',
        invalid: 'Nome completo do pai ou da mãe',
      },
      {
        path: '/login',
        label: 'CPF ou e-mail',
        value: 'teste@eteconectada.invalid',
        invalid: 'Senha',
      },
      {
        path: '/recuperar-acesso',
        label: 'E-mail da conta',
        value: 'email-invalido',
        invalid: 'E-mail da conta',
      },
    ];
    for (const { path, label, value, invalid } of flows) {
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'script') await gate;
        await route.continue();
      });
      await page.goto(`${environment.base}${path}`, { waitUntil: 'commit' });
      const submit = page.locator('form button[type="submit"]').first();
      await expect(submit).toBeVisible();
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveText(/Carregando/);
      await expect(submit).toHaveAttribute('aria-busy', 'true');
      if (path === '/cadastro') {
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({
            path: test.info().outputPath(`carregando-${width}.png`),
            fullPage: true,
          });
        }
      }
      const input = page.getByLabel(label, { exact: true });
      await input.fill(value);
      if (path === '/cadastro')
        await page.getByLabel('Data de nascimento').fill('2008-01-15');
      await input.press('Enter');
      // Duas voltas do renderizador permitem observar a ação padrão do teclado.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(posts).toEqual([]);
      expect(new URL(page.url()).pathname).toBe(path);
      expect(new URL(page.url()).search).toBe('');
      release();
      await expect(submit).toBeEnabled();
      await expect(submit).toHaveAttribute('aria-busy', 'false');
      await expect(input).toHaveValue(value);
      await submit.click();
      const missing = page.getByLabel(invalid, { exact: true });
      await expect(missing).toBeFocused();
      await expect(missing).toHaveAttribute('aria-invalid', 'true');
      expect(posts).toEqual([]);
      await page.unrouteAll({ behavior: 'wait' });
    }
    const noScripts = await browser.newContext({ javaScriptEnabled: false });
    try {
      const noScriptPage = await noScripts.newPage();
      for (const { path } of flows) {
        await noScriptPage.goto(`${environment.base}${path}`);
        await expect(
          noScriptPage.locator('form button[type="submit"]').first(),
        ).toBeDisabled();
        await expect(
          noScriptPage.getByText(/ative o JavaScript.*secretaria/),
        ).toBeVisible();
      }
      await noScriptPage.goto(`${environment.base}/redefinir-senha`);
      await expect(
        noScriptPage.getByText(/ative o JavaScript.*secretaria/),
      ).toBeVisible();
    } finally {
      await noScripts.close();
    }
  } finally {
    release();
    try {
      await page.unrouteAll({ behavior: 'wait' });
    } finally {
      await environment.close();
    }
  }
});
