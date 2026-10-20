import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as tlsRequest } from 'node:https';
import { request as plainRequest } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const mode = process.argv[2];
assert.ok(['probe', 'apps', 'rotated'].includes(mode));
const ca = readFileSync(process.env.PROXY_TEST_CA_FILE);
const certificate = new X509Certificate(
  readFileSync(process.env.ETE_LAB_TLS_CERT_FILE),
);
const port = Number(process.env.ETE_LAB_HTTPS_PORT);
const httpPort = Number(process.env.PROXY_TEST_HTTP_PORT);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
assert.ok(Number.isInteger(httpPort) && httpPort >= 1024 && httpPort <= 65535);
const origin = (app) => `https://${app}.example.invalid:${port}`;
const lookup = (_hostname, options, callback) =>
  options.all
    ? callback(null, [{ address: '127.0.0.1', family: 4 }])
    : callback(null, '127.0.0.1', 4);

async function request(app, pathname = '/', options = {}) {
  return new Promise((resolve, reject) => {
    const secure = !options.plain;
    const req = (secure ? tlsRequest : plainRequest)(
      {
        hostname: secure ? `${app}.example.invalid` : '127.0.0.1',
        port: secure ? port : httpPort,
        path: pathname,
        ca,
        lookup,
        agent: false,
        // O Host forjado não deve também trocar o SNI automático do cliente Node.
        ...(secure ? { servername: `${app}.example.invalid` } : {}),
        method: options.body || options.chunks ? 'POST' : 'GET',
        headers: {
          Host: `${app}.example.invalid:${secure ? port : httpPort}`,
          ...options.headers,
        },
        ...(options.untrusted ? { ca: undefined } : {}),
      },
      (res) => {
        let body = '';
        const fingerprint = res.socket?.getPeerCertificate?.().fingerprint256;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            fingerprint,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(15_000, () =>
      req.destroy(new Error('Requisição de teste excedeu prazo.')),
    );
    if (options.chunks) {
      for (const chunk of options.chunks) req.write(chunk);
      req.end();
    } else req.end(options.body);
  });
}

if (mode === 'probe') {
  const forged = {
    Forwarded: 'for=198.51.100.1;host=evil.example;proto=http',
    'X-Forwarded-Host': 'evil.example',
    'X-Forwarded-Proto': 'http',
    'X-Forwarded-For': '198.51.100.1',
    'X-Real-IP': '198.51.100.2',
  };
  const normal = await request('site', '/', { headers: forged });
  assert.equal(normal.status, 200);
  const headers = JSON.parse(normal.body).headers;
  assert.equal(headers.host, `site.example.invalid:${port}`);
  assert.equal(headers['x-forwarded-host'], `site.example.invalid:${port}`);
  assert.equal(headers['x-forwarded-proto'], 'https');
  assert.equal(headers.forwarded, undefined);
  assert.equal(headers['x-real-ip'], undefined);
  assert.ok(!headers['x-forwarded-for'].includes('198.51.100.1'));
  assert.equal(
    (
      await request('site', '/', {
        headers: { 'X-Oversized': 'x'.repeat(24 * 1024) },
      })
    ).status,
    431,
    'Cabeçalho acima do limite precisa ser recusado.',
  );
  const limit = 3 * 1024 * 1024;
  const accepted = await request('site', '/', {
    body: Buffer.alloc(limit, 120),
  });
  assert.equal(accepted.status, 200);
  assert.equal(JSON.parse(accepted.body).bytes, limit);
  for (const options of [
    {
      body: Buffer.alloc(limit + 1, 120),
      headers: { 'Content-Length': String(limit + 1) },
    },
    { chunks: Array.from({ length: 49 }, () => Buffer.alloc(65536, 120)) },
  ]) {
    const rejected = await request('site', '/', options);
    assert.equal(
      rejected.status,
      413,
      'Limite de upload precisa recusar inclusive chunked.',
    );
    assert.match(rejected.headers['cache-control'], /no-store/);
    assert.ok(
      !/stack|\/app|postgres|reverse_proxy|dial tcp/i.test(rejected.body),
    );
  }
  // Conexão TLS real com cabeçalho HTTP incompleto; não usa timer falso.
  await new Promise((resolve, reject) => {
    const started = Date.now();
    let output = '';
    const socket = tlsConnect(
      { host: '127.0.0.1', port, servername: 'site.example.invalid', ca },
      () => {
        socket.write(
          'GET / HTTP/1.1\r\nHost: site.example.invalid\r\nX-Incomplete: ',
        );
      },
    );
    socket.on('data', (chunk) => {
      output += chunk;
    });
    socket.on('error', reject);
    socket.setTimeout(12_000, () =>
      socket.destroy(new Error('Cabeçalho lento não foi encerrado.')),
    );
    socket.on('close', () => {
      try {
        assert.ok(Date.now() - started < 10_000);
        assert.ok(!output.includes('200 OK'));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  console.log(
    'OK: proxy real remove cabeçalhos forjados, aceita 3MiB, recusa excesso fixo/chunked e encerra cabeçalho lento.',
  );
} else {
  for (const app of ['site', 'portal']) {
    const pathname = app === 'site' ? '/' : '/login';
    const res = await request(app, pathname);
    assert.equal(res.status, 200);
    assert.equal(res.fingerprint, certificate.fingerprint256);
    assert.equal(res.headers['strict-transport-security'], 'max-age=15552000');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.match(res.headers['content-security-policy'], /nonce-/);
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal(res.headers.server, undefined);
    await assert.rejects(
      () => request(app, pathname, { untrusted: true }),
      /certificate|self.signed|issuer/i,
    );
    const mismatch = await request(app, pathname, {
      headers: { Host: 'evil.example' },
    });
    assert.equal(mismatch.status, 421);
    const redirect = await request(app, '/login/?test=1', { plain: true });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `${origin(app)}/login/?test=1`);
    const badHost = await request(app, '/', {
      plain: true,
      headers: {
        Host: 'evil.example',
        'X-Forwarded-Host': `${app}.example.invalid`,
      },
    });
    assert.equal(badHost.status, 421);
    assert.equal(badHost.headers.location, undefined);
  }
  if (mode === 'rotated') {
    assert.notEqual(
      certificate.fingerprint256,
      process.env.PROXY_TEST_PREVIOUS_FINGERPRINT,
    );
    console.log(
      'OK: novo certificado conferido com CA e nome nos dois endereços após recriação.',
    );
  } else {
    const redirect = await request('portal', '/login/?x=1', {
      headers: {
        'X-Forwarded-Host': 'evil.example',
        'X-Forwarded-Proto': 'http',
      },
    });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `${origin('portal')}/login?x=1`);
    for (const [headers, status] of [
      [{ Origin: 'https://evil.example' }, 403],
      [{ Origin: origin('portal') }, 401],
      [
        {
          Origin: origin('portal'),
          Cookie:
            '__Host-ete_portal_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; role=secretary',
        },
        401,
      ],
    ]) {
      const res = await request('portal', '/api/secretaria/importacao', {
        body: '{}',
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      assert.equal(res.status, status);
      assert.match(res.headers['cache-control'], /no-store/);
      assert.match(
        res.headers['content-security-policy'],
        /default-src 'none'/,
      );
    }
    const login = await request('portal', '/api/login', {
      body: '{}',
      headers: { Origin: origin('portal'), 'Content-Type': 'application/json' },
    });
    assert.equal(
      login.status,
      404,
      'Preparação HTTPS não pode liberar login de produção.',
    );
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP site.example.invalid 127.0.0.1, MAP portal.example.invalid 127.0.0.1',
        `--ignore-certificate-errors-spki-list=${process.env.PROXY_TEST_SPKI}`,
      ],
    });
    try {
      for (const app of ['site', 'portal']) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        const failedResources = [];
        // Estas jornadas abrem só páginas públicas sintéticas e não digitam dados.
        const publicError = (message) =>
          message
            .replace(/https?:\/\/[^\s'"<>]+/g, '[endereço]')
            .replace(/nonce-[^\s'";]+/g, 'nonce-[omitido]')
            .slice(0, 400);
        page.on('pageerror', (error) =>
          errors.push(`JavaScript ${app}: ${publicError(error.message)}`),
        );
        page.on('console', (message) => {
          if (message.type() === 'error')
            errors.push(`Console ${app}: ${publicError(message.text())}`);
        });
        page.on('response', (response) => {
          if (response.status() >= 400 && failedResources.length < 12)
            failedResources.push({
              status: response.status(),
              path: new URL(response.url()).pathname.slice(0, 180),
            });
        });
        page.on('requestfailed', (request) => {
          if (failedResources.length < 12)
            failedResources.push({
              error:
                request.failure()?.errorText.match(/net::ERR_[A-Z_]+/)?.[0] ??
                'falha de rede',
              path: new URL(request.url()).pathname.slice(0, 180),
            });
        });
        await page.goto(`${origin(app)}${app === 'site' ? '/' : '/login'}`, {
          waitUntil: 'networkidle',
        });
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => window.isSecureContext), true);
        assert.ok(
          await page.evaluate(() =>
            Array.from(document.fonts).some((f) => f.status === 'loaded'),
          ),
        );
        if (app === 'portal') {
          await page.getByRole('button', { name: 'Mostrar senha' }).click();
          await expect(
            page.getByLabel('Senha', { exact: true }),
          ).toHaveAttribute('type', 'text');
          await page.getByRole('button', { name: 'Ocultar senha' }).click();
          await expect(
            page.getByLabel('Senha', { exact: true }),
          ).toHaveAttribute('type', 'password');
        } else {
          const portalLink = page.getByRole('link', {
            name: 'Acessar portal',
            exact: true,
          });
          await expect(portalLink).toHaveAttribute(
            'href',
            `${origin('portal')}/`,
          );
          // A entrada do portal decide entre a sessão existente e o login.
          await portalLink.click();
          await page.waitForURL(`${origin('portal')}/login`);
          await page
            .getByRole('heading', { name: 'Acesso ao portal' })
            .waitFor();
        }
        assert.deepEqual(
          errors,
          [],
          `Console sem erros; recursos recusados: ${JSON.stringify(failedResources)}`,
        );
        await context.close();
      }
    } finally {
      await browser.close();
    }
    console.log(
      'OK: dois endereços HTTPS, TLS/host/redirects/cabeçalhos/origem/autorização, produção bloqueada e navegador real.',
    );
  }
}
