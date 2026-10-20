import assert from 'node:assert/strict';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const env = await openTestEnvironment({ http: true });
  const { base } = env;
  try {
    const nonces = new Set<string>();
    for (const path of [
      '/login',
      '/cadastro',
      '/recuperar-acesso',
      '/pagina-inexistente',
    ]) {
      const response = await fetch(base + path, {
        headers: {
          'x-nonce': 'valor-forjado',
          'Content-Security-Policy': "script-src 'unsafe-inline'",
          'next-router-prefetch': '1',
          'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy',
        },
      });
      assert.equal(response.status, path === '/pagina-inexistente' ? 404 : 200);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      const csp = response.headers.get('content-security-policy') ?? '';
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /form-action 'self'/);
      const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      assert.ok(nonce && nonce.length >= 24);
      assert.ok(!nonces.has(nonce), 'Nonce deve mudar por resposta.');
      nonces.add(nonce);
      assert.ok(!csp.includes('valor-forjado'));
      const html = await response.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      assert.ok(scripts.length > 0);
      for (const script of scripts)
        assert.ok(
          script.includes(`nonce="${nonce}"`),
          'Script SSR deve receber nonce da resposta.',
        );
    }
    const inputs = [
      [
        '/api/secretaria/solicitacoes',
        undefined,
        undefined,
        401,
        'application/json',
      ],
      ['/api/login', undefined, undefined, 405, 'application/json'],
      ['/api/login', '{}', undefined, 403, 'application/json'],
      ['/api/login', '{}', base, 400, 'application/json'],
      ['/api/login', '{}', base, 415, 'text/plain'],
      [
        '/api/registration/verify',
        JSON.stringify({ padding: 'a'.repeat(4096) }),
        base,
        413,
        'application/json',
      ],
    ] as const;
    for (const [path, body, origin, status, contentType] of inputs) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': contentType,
          ...(origin ? { Origin: origin } : {}),
        },
        ...(body === undefined ? {} : { body }),
      });
      assert.equal(response.status, status);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
    }
    const redirect = await fetch(base + '/login/', { redirect: 'manual' });
    const apiRedirect = await fetch(base + '/api/login/?token=ficticio', {
      method: 'POST',
      body: '{}',
      redirect: 'manual',
      headers: {
        Host: 'evil.invalid',
        'X-Forwarded-Host': 'evil.invalid',
        'Content-Type': 'application/json',
      },
    });
    assert.equal(apiRedirect.status, 308);
    const apiDestination = new URL(apiRedirect.headers.get('location')!, base);
    assert.equal(apiDestination.origin, base);
    assert.equal(
      apiDestination.pathname + apiDestination.search,
      '/api/login?token=ficticio',
    );
    assert.match(apiRedirect.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(redirect.status, 308);
    assert.match(redirect.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(redirect.headers.get('referrer-policy'), 'no-referrer');
    const poisoned = await fetch(base + '/login/?token=ficticio', {
      redirect: 'manual',
      headers: { Host: 'evil.invalid', 'X-Forwarded-Host': 'evil.invalid' },
    });
    assert.equal(poisoned.status, 308);
    const destination = new URL(poisoned.headers.get('location')!, base);
    assert.equal(destination.origin, base);
    assert.equal(
      destination.pathname + destination.search,
      '/login?token=ficticio',
    );
    assert.match(poisoned.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(
      (await fetch(base + '/login')).headers.get('strict-transport-security'),
      null,
      'HSTS não se habilita no desenvolvimento HTTP.',
    );
    console.log(
      'OK: páginas/404/APIs negadas preservam cabeçalhos privados; nonce por resposta ignora cabeçalhos forjados e cobre scripts SSR.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
