import { test, expect } from '@playwright/test';
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { Duplex } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
import { openTestEnvironment } from '../../scripts/test-environment';

// TLS só no loopback, CA efêmera e dados fictícios. Não altera certificados do sistema.
test('HTTPS protege a sessão, recusa scripts indevidos e bloqueia enquadramento', async ({
  browser,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'ete-tls-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  let environment: Awaited<ReturnType<typeof openTestEnvironment>> | undefined;
  let upstream = '';
  let publicBase = '';
  const tunnels = new Set<Duplex>();
  let studentId: string | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=portal.ete-test.localhost',
        '-addext',
        'subjectAltName=DNS:portal.ete-test.localhost,DNS:site.ete-test.localhost',
      ],
      { stdio: 'ignore' },
    );
    await chmod(keyPath, 0o600);
    const name = '__Host-ete_portal_session';
    const legacyName = 'ete_portal_session';
    server = createServer(
      { key: await readFile(keyPath), cert: await readFile(certPath) },
      (req, res) => {
        if (req.url === '/__frame') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            `<!doctype html><title>Laboratório</title><iframe src="${publicBase}/login"></iframe>`,
          );
          return;
        }
        // Página do subdomínio irmão tenta injetar cookie no domínio pai.

        if (req.url === '/__cookie-parent') {
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Set-Cookie': `${name}=adulterado; Secure; HttpOnly; Path=/; Domain=ete-test.localhost`,
          });
          res.end('<!doctype html><title>Laboratório</title>');
          return;
        }
        if (!upstream) {
          res.writeHead(503);
          res.end();
          return;
        }
        const proxy = httpRequest(
          upstream + req.url,
          {
            method: req.method,
            headers: {
              ...req.headers,
              'x-forwarded-proto': 'https',
              ...(req.url === '/login'
                ? { 'accept-encoding': 'identity' }
                : {}),
            },
          },
          (response) => {
            // Alteração controlada do HTML no proxy próprio; CSP/nonce originais preservados.
            // Evita atribuir origem pública à resposta TLS local via interceptação do navegador.
            if (
              req.url === '/login' &&
              response.headers['content-type']?.includes('text/html')
            ) {
              if (response.headers['content-encoding']) {
                response.resume();
                res.writeHead(502);
                res.end();
                return;
              }
              const chunks: Buffer[] = [];
              response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
              response.once('end', () => {
                const html = Buffer.concat(chunks)
                  .toString('utf8')
                  .replace(
                    '</head>',
                    '<script>window.__cspProbe=true</script></head>',
                  );
                const headers = { ...response.headers };
                delete headers['content-length'];
                delete headers['transfer-encoding'];
                res.writeHead(response.statusCode ?? 502, headers);
                res.end(html);
              });
              response.once('error', () => res.destroy());
              return;
            }
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          },
        );
        proxy.once('error', () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.once('aborted', () => proxy.destroy());
        req.pipe(proxy);
      },
    );
    server.on('upgrade', (req, socket, head) => {
      if (!upstream) {
        socket.destroy();
        return;
      }
      const proxy = httpRequest(upstream + req.url, {
        headers: { ...req.headers, 'x-forwarded-proto': 'https' },
      });
      proxy.once('upgrade', (response, target, initial) => {
        tunnels.add(socket);
        tunnels.add(target);
        socket.once('close', () => {
          tunnels.delete(socket);
          target.destroy();
        });
        target.once('close', () => {
          tunnels.delete(target);
          socket.destroy();
        });
        socket.on('error', () => target.destroy());
        target.on('error', () => socket.destroy());
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            Object.entries(response.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n') +
            '\r\n\r\n',
        );
        if (head.length) target.write(head);
        if (initial.length) socket.write(initial);
        target.pipe(socket);
        socket.pipe(target);
      });
      proxy.once('error', () => socket.destroy());
      proxy.once('response', () => socket.destroy());
      proxy.end();
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('TLS sem porta própria.');
    const base = `https://portal.ete-test.localhost:${address.port}`;
    const sibling = `https://site.ete-test.localhost:${address.port}`;
    publicBase = base;
    environment = await openTestEnvironment({ http: true, publicOrigin: base });
    upstream = environment.base;
    const { db } = environment;
    const password = randomBytes(24).toString('base64url');
    const email = `tls-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
    const student = await db.student.create({
      data: {
        fullName: 'Pessoa Fictícia HTTPS',
        birthDate: new Date('2000-01-01'),
        account: {
          create: {
            role: 'student',
            status: 'active',
            email,
            passwordHash: await hashPassword(password),
          },
        },
      },
      include: { account: true },
    });
    studentId = student.id;
    // Exceção de certificado exclusivamente neste contexto e nesta CA efêmera.
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Reflect.set(window, '__cspViolations', 0);
      document.addEventListener('securitypolicyviolation', (event) => {
        if (event.effectiveDirective.startsWith('script-src'))
          Reflect.set(
            window,
            '__cspViolations',
            Number(Reflect.get(window, '__cspViolations')) + 1,
          );
      });
    });
    await page.goto(base + '/login');
    await expect(
      page.getByRole('button', { name: 'Entrar no portal' }),
    ).toBeEnabled({ timeout: 60_000 });
    expect(
      await page.evaluate(() => Reflect.get(window, '__cspProbe') === true),
    ).toBe(false);
    await expect
      .poll(() =>
        page.evaluate(() => Number(Reflect.get(window, '__cspViolations'))),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => Reflect.get(window, '__cspProbe') === true),
    ).toBe(false);
    await page.getByLabel('CPF ou e-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await expect(
      page.getByRole('button', { name: 'Entrar no portal' }),
    ).toBeEnabled({ timeout: 60_000 });
    const login = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/login',
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    expect((await login).status()).toBe(200);
    await expect(page).toHaveURL(base + '/');
    await expect(
      page.getByRole('button', { name: 'Abrir menu de serviços' }),
    ).toBeEnabled();
    const cookies = await context.cookies(base);
    const cookie = cookies.find((c) => c.name === name);
    expect(
      cookie,
      'HTTPS deve usar cookie próprio com prefixo de host.',
    ).toBeDefined();
    expect(cookie!.secure).toBe(true);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');
    expect(cookie!.domain).toBe('portal.ete-test.localhost');
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(604_700);
    expect(cookie!.expires - Date.now() / 1000).toBeLessThanOrEqual(604_800);
    expect(cookies.some((c) => c.name === legacyName)).toBe(false);
    expect(await page.evaluate(() => document.cookie)).not.toContain(name);
    expect((await context.cookies(sibling)).some((c) => c.name === name)).toBe(
      false,
    );
    const hash = createHash('sha256').update(cookie!.value).digest('hex');
    expect(await db.session.count({ where: { tokenHash: hash } })).toBe(1);
    const other = await context.newPage();
    await other.goto(sibling + '/__cookie-parent');
    expect(
      (await context.cookies(base)).find((c) => c.name === name)?.value,
    ).toBe(cookie!.value);
    let frameBlocked = false;
    other.on('console', (message) => {
      if (/frame-ancestors|X-Frame-Options/.test(message.text()))
        frameBlocked = true;
    });
    await other.goto(sibling + '/__frame');
    await expect.poll(() => frameBlocked).toBe(true);
    await expect(
      other
        .frameLocator('iframe')
        .getByRole('heading', { name: 'Acesso ao portal' }),
    ).toHaveCount(0);
    await other.close();
    // Cookie antigo não autentica em HTTPS. Um token alterado também não.
    await context.clearCookies();
    await context.addCookies([
      {
        name: legacyName,
        value: cookie!.value,
        url: base,
        secure: true,
        httpOnly: true,
      },
    ]);
    await page.goto(base + '/');
    await expect(page).toHaveURL(base + '/login');
    await context.clearCookies();
    const tampered =
      cookie!.value.slice(0, -1) + (cookie!.value.endsWith('A') ? 'B' : 'A');
    await context.addCookies([{ ...cookie!, value: tampered }]);
    await page.goto(base + '/');
    await expect(page).toHaveURL(base + '/login');
    await context.clearCookies();
    await context.addCookies([cookie!]);
    const logout = await context.request.post(base + '/api/logout', {
      headers: { Origin: base },
    });
    expect(logout.status()).toBe(200);
    expect((await context.cookies(base)).some((c) => c.name === name)).toBe(
      false,
    );
    expect(await db.session.count({ where: { tokenHash: hash } })).toBe(0);
    // Repor o token anterior após logout não devolve acesso.
    await context.addCookies([cookie!]);
    await page.goto(base + '/');
    await expect(page).toHaveURL(base + '/login');
  } finally {
    try {
      await context?.close();
      if (studentId && environment)
        await environment.db.student.deleteMany({ where: { id: studentId } });
    } finally {
      try {
        await environment?.close();
      } finally {
        for (const socket of tunnels) socket.destroy();
        if (server) {
          server.closeAllConnections();
          await new Promise<void>((resolve) => server!.close(() => resolve()));
        }
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
});
