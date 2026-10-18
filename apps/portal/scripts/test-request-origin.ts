import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameOriginRequest } from '../src/lib/private-request';
import { verificationUrl } from '../src/lib/portal-origin';

const request = (origin?: string, extra: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3001/api/login', {
    method: 'POST',
    headers: { ...(origin ? { Origin: origin } : {}), ...extra },
  });

test('confirmação usa configuração confiável ou caminho relativo somente no desenvolvimento', () => {
  const token = 'A'.repeat(43);
  const env = {
    NODE_ENV: 'development',
    PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
  };
  assert.equal(
    new URL(verificationUrl(token, env)!).origin,
    env.PORTAL_PUBLIC_URL,
  );
  assert.equal(
    verificationUrl(token, { NODE_ENV: 'development' }),
    `/confirmar-email?token=${token}`,
  );
  assert.equal(verificationUrl(token, { NODE_ENV: 'production' }), null);
  assert.equal(
    verificationUrl(token, {
      NODE_ENV: 'production',
      PORTAL_PUBLIC_URL: 'http://127.0.0.1',
    }),
    null,
  );
  assert.equal(
    verificationUrl(token, {
      ...env,
      PORTAL_PUBLIC_URL: 'https://portal.example.invalid/rota',
    }),
    null,
  );
});

test('origem configurada protege proxy sem confiar em Host ou forwarded', () => {
  const env = {
    NODE_ENV: 'production',
    PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
  };
  assert.equal(
    sameOriginRequest(request('https://portal.example.invalid'), env),
    true,
  );
  for (const origin of [
    undefined,
    'null',
    'https://portal.example.invalid.evil.invalid',
    'https://evil.invalid',
    'https://portal.example.invalid/caminho',
  ])
    assert.equal(
      sameOriginRequest(
        request(origin, {
          Host: 'evil.invalid',
          'X-Forwarded-Host': 'portal.example.invalid',
        }),
        env,
      ),
      false,
    );
  assert.equal(
    sameOriginRequest(
      request('https://portal.example.invalid', {
        'Sec-Fetch-Site': 'cross-site',
      }),
      env,
    ),
    false,
  );
  assert.equal(
    sameOriginRequest(request('https://portal.example.invalid'), {
      ...env,
      PORTAL_PUBLIC_URL: 'https://usuario:senha@portal.example.invalid',
    }),
    false,
  );
});

test('sem configuração só desenvolvimento admite loopback ou LAN da própria origem', () => {
  assert.equal(
    sameOriginRequest(request('http://127.0.0.1:3001'), {
      NODE_ENV: 'production',
    }),
    false,
  );
  assert.equal(
    sameOriginRequest(request('http://127.0.0.1:3001'), {
      NODE_ENV: 'development',
    }),
    true,
  );
  assert.equal(
    sameOriginRequest(
      request('http://192.168.1.20:3001', { Host: '192.168.1.20:3001' }),
      { NODE_ENV: 'development' },
    ),
    true,
  );
  for (const host of ['escola', 'escola.local', 'escola.lan']) {
    assert.equal(
      sameOriginRequest(
        request(`http://${host}:3001`, { Host: `${host}:3001` }),
        {
          NODE_ENV: 'development',
          NEXT_PUBLIC_LAN_HOST: host,
        },
      ),
      true,
    );
  }
  for (const host of ['outra.local', 'evil.invalid']) {
    assert.equal(
      sameOriginRequest(
        request(`http://${host}:3001`, { Host: `${host}:3001` }),
        {
          NODE_ENV: 'development',
          NEXT_PUBLIC_LAN_HOST: 'escola.local',
        },
      ),
      false,
    );
  }
  assert.equal(
    sameOriginRequest(
      request('https://evil.invalid', { Host: 'evil.invalid' }),
      { NODE_ENV: 'development' },
    ),
    false,
  );
  assert.equal(
    sameOriginRequest(request('http://127.0.0.1:3001'), {
      NODE_ENV: 'development',
      PORTAL_PUBLIC_URL: 'inválida',
    }),
    false,
  );
});

test('login, logout e cadastro rejeitam origem ausente antes de corpo, banco ou cookies', async () => {
  const previous = process.env.NODE_ENV;
  Reflect.set(process.env, 'NODE_ENV', 'development');
  try {
    const handlers = [
      (await import('../src/app/api/login/route')).POST,
      (await import('../src/app/api/logout/route')).POST,
      (await import('../src/app/api/registration/check/route')).POST,
      (await import('../src/app/api/registration/start/route')).POST,
      (await import('../src/app/api/registration/verify/route')).POST,
    ];
    for (const handler of handlers) {
      const response = await handler(request());
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', previous);
  }
});
