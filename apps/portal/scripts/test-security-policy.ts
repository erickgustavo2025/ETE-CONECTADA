import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestSecurityHeaders } from '../../../shared/security-headers';

test('política recusa scripts inline, eval em produção, objetos e frames externos', () => {
  for (const NODE_ENV of ['development', 'production', 'test']) {
    const headers = requestSecurityHeaders('A'.repeat(24), { NODE_ENV });
    const script = headers['Content-Security-Policy']
      .split('; ')
      .find((s) => s.startsWith('script-src '))!;
    assert.ok(!script.includes("'unsafe-inline'"));
    assert.equal(script.includes("'unsafe-eval'"), NODE_ENV === 'development');
    assert.match(script, /'strict-dynamic'/);
    const style = headers['Content-Security-Policy']
      .split('; ')
      .find((s) => s.startsWith('style-src '))!;
    assert.equal(style.includes("'unsafe-inline'"), NODE_ENV === 'development');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.match(headers['Cache-Control'], /no-store/);
    assert.equal(headers['Strict-Transport-Security'], undefined);
  }
  for (const nonce of [
    '',
    'curto',
    "A'; script-src *",
    'a'.repeat(24) + '\r\nX-Foo: bar',
  ]) {
    assert.throws(() => requestSecurityHeaders(nonce), /Nonce de segurança/);
  }
});

test('HSTS depende de confirmação explícita de TLS e produção, sem incluir outros subdomínios', () => {
  for (const NODE_ENV of ['test', 'development'])
    assert.equal(
      requestSecurityHeaders('A'.repeat(24), {
        NODE_ENV,
        HTTPS_VERIFIED: 'true',
      })['Strict-Transport-Security'],
      undefined,
    );
  const header = requestSecurityHeaders('B'.repeat(24), {
    NODE_ENV: 'production',
    HTTPS_VERIFIED: 'true',
  })['Strict-Transport-Security'];
  assert.equal(header, 'max-age=15552000');
});

test('origem de redirects usa configuração confiável e falha fechada sem domínio de produção', async () => {
  const { trustedOrigin } = await import('../../../shared/request-origin');
  assert.equal(
    trustedOrigin(
      'http://evil.invalid/login/',
      'evil.invalid',
      'https://portal.example.invalid',
      { NODE_ENV: 'production' },
    ),
    'https://portal.example.invalid',
  );
  for (const publicUrl of [
    undefined,
    'inválida',
    'http://localhost:3002',
    'https://usuario:senha@portal.example.invalid',
  ])
    assert.equal(
      trustedOrigin('http://evil.invalid/login/', 'evil.invalid', publicUrl, {
        NODE_ENV: 'production',
      }),
      null,
    );
  assert.equal(
    trustedOrigin('http://127.0.0.1:3002/login/', null, undefined, {
      NODE_ENV: 'development',
    }),
    'http://127.0.0.1:3002',
  );
  assert.equal(
    trustedOrigin('http://evil.invalid/login/', 'evil.invalid', undefined, {
      NODE_ENV: 'development',
    }),
    null,
  );
});

test('normalização da API responde antes do corpo e não aceita destino externo', async () => {
  const { withApiCanonicalPath } = await import('../src/lib/api-route');
  let calls = 0;
  const handler = withApiCanonicalPath(() => {
    calls++;
    return Response.json({ ok: true });
  });
  const request = new Request('http://evil.invalid/api/login/?token=ficticio', {
    method: 'POST',
  });
  Object.defineProperty(request, 'body', {
    get() {
      throw new Error('Corpo não deve ser lido.');
    },
  });
  const redirect = await handler(request);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/api/login?token=ficticio');
  assert.match(redirect.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(calls, 0);
  assert.equal(
    (await handler(new Request('http://127.0.0.1/api/login'))).status,
    200,
  );
  assert.equal(calls, 1);
});
