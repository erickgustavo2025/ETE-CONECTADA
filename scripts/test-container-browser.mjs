import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const origins = [
  process.env.CONTAINER_SITE_URL,
  process.env.CONTAINER_PORTAL_URL,
];
for (const origin of origins) {
  const url = new URL(origin);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port);
}
const browser = await chromium.launch({ headless: true });
try {
  for (const [index, origin] of origins.entries()) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const failures = [];
    page.on('console', (message) => {
      if (message.type() === 'error')
        failures.push('Erro no console do navegador.');
    });
    page.on('pageerror', () => failures.push('Erro de execução no navegador.'));
    page.on('requestfailed', (request) => {
      if (request.url().includes('/_next/'))
        failures.push('Recurso do build não carregou.');
    });
    try {
      await page.goto(`${origin}${index ? '/login' : '/'}`, {
        waitUntil: 'networkidle',
      });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(() =>
          Array.from(document.fonts).some((font) => font.status === 'loaded'),
        ),
      );
      await page.getByRole('heading', { level: 1 }).waitFor();
      if (!index && process.env.CONTAINER_EXPECTED_PORTAL_ORIGIN) {
        const expected = new URL(process.env.CONTAINER_EXPECTED_PORTAL_ORIGIN);
        await expect(
          page.getByRole('link', { name: 'Acessar portal', exact: true }),
        ).toHaveAttribute('href', new URL('/', expected).toString());
        await expect(
          page.getByRole('link', { name: 'Primeiro acesso', exact: false }),
        ).toHaveAttribute('href', new URL('/cadastro', expected).toString());
      }
      if (index) {
        const password = page.getByLabel('Senha', { exact: true });
        assert.equal(await password.getAttribute('type'), 'password');
        await page.getByRole('button', { name: 'Mostrar senha' }).click();
        await expect(password).toHaveAttribute('type', 'text');
        await page.getByRole('button', { name: 'Ocultar senha' }).click();
        await expect(password).toHaveAttribute('type', 'password');
      }
      await page.setViewportSize({ width: 360, height: 800 });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(failures, []);
      console.log(
        `OK: navegador no container ${index ? 'portal' : 'site'}, fontes, scripts e tela pequena.`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
