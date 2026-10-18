import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../../', import.meta.url));

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const ended = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), 5000);
  try {
    await ended;
  } finally {
    clearTimeout(timer);
  }
}

test('produção preserva scripts autorizados e recusa script injetado no site e no portal', async ({
  browser,
}) => {
  // Cópia própria sem .env: nenhuma credencial de banco, e-mail ou escola no build/runtime.
  for (const dir of [root, root + 'apps/portal/', root + 'apps/site/'])
    for (const name of [
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ])
      expect(
        existsSync(dir + name),
        'Exige checkout isolado sem arquivos de ambiente.',
      ).toBe(false);
  const bin = require.resolve('next/dist/bin/next');
  for (const app of ['portal', 'site']) {
    let child: ChildProcess | undefined;
    let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: 'C.UTF-8',
        TZ: 'UTC',
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
      };
      const launch = (args: string[]) => {
        child = spawn(process.execPath, [bin, ...args], {
          cwd: root + `apps/${app}/`,
          env,
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        return child;
      };
      const build = launch(['build', '--webpack']);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Build de teste excedeu 90 segundos.')),
          90_000,
        );
        build.once('error', () => {
          clearTimeout(timer);
          reject(new Error('Build não iniciou.'));
        });
        build.once('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('Build isolado falhou.'));
        });
      });
      const listener = createServer();
      const port = await new Promise<number>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', () => {
          const address = listener.address();
          if (!address || typeof address === 'string') {
            listener.close();
            reject(new Error('Porta de teste ausente.'));
            return;
          }
          listener.close((error) =>
            error ? reject(error) : resolve(address.port),
          );
        });
      });
      const server = launch([
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ]);
      const base = `http://127.0.0.1:${port}`;
      const path = app === 'portal' ? '/login' : '/';
      await expect
        .poll(
          async () => {
            if (server.exitCode !== null || server.signalCode !== null)
              throw new Error('Servidor isolado encerrou.');
            try {
              return (
                await fetch(base + path, { signal: AbortSignal.timeout(2000) })
              ).status;
            } catch {
              return 0;
            }
          },
          { timeout: 30_000 },
        )
        .toBe(200);
      context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.name));
      await page.addInitScript(() => {
        Reflect.set(window, '__productionCspViolations', 0);
        document.addEventListener('securitypolicyviolation', (event) => {
          if (event.effectiveDirective.startsWith('script-src'))
            Reflect.set(
              window,
              '__productionCspViolations',
              Number(Reflect.get(window, '__productionCspViolations')) + 1,
            );
        });
      });
      await page.route(base + path, async (route) => {
        const response = await route.fetch();
        const html = (await response.text()).replace(
          '</head>',
          '<script>window.__productionCspProbe=true</script></head>',
        );
        await route.fulfill({ response, body: html });
      });
      const response = await page.goto(base + path);
      const csp = response!.headers()['content-security-policy'];
      expect(csp).toContain("frame-ancestors 'none'");
      expect(
        csp.split('; ').find((value) => value.startsWith('script-src ')),
      ).not.toMatch(/unsafe-inline|unsafe-eval/);
      if (app === 'portal') {
        await page
          .getByLabel('Senha', { exact: true })
          .fill('Senha fictícia de teste');
        await page
          .getByRole('button', { name: 'Mostrar senha', exact: true })
          .click();
        await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute(
          'type',
          'text',
        );
      } else {
        await expect(
          page.getByRole('link', { name: 'Ir para o conteúdo', exact: true }),
        ).toHaveAttribute('href', '#conteudo');
      }
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(Reflect.get(window, '__productionCspViolations')),
          ),
        )
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => Reflect.get(window, '__productionCspProbe') === true,
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      try {
        await context?.close();
      } finally {
        if (child) await stop(child);
      }
    }
  }
});
