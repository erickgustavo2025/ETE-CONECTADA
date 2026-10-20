import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  sessionCookiePolicy,
  sessionDurationSeconds,
} from '../src/lib/session-cookie';

test('HTTP de desenvolvimento preserva demonstração local; HTTPS usa cookie host-only seguro', () => {
  for (const PORTAL_PUBLIC_URL of [
    undefined,
    '',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ]) {
    const cookie = sessionCookiePolicy({
      NODE_ENV: 'development',
      PORTAL_PUBLIC_URL,
    });
    assert.equal(cookie.name, 'ete_portal_session');
    assert.deepEqual(cookie.options, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 604800,
    });
    assert.equal('domain' in cookie.options, false);
  }
  for (const NODE_ENV of ['production', 'test', 'development']) {
    const cookie = sessionCookiePolicy({
      NODE_ENV,
      PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
    });
    assert.equal(cookie.name, '__Host-ete_portal_session');
    assert.deepEqual(cookie.options, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 604800,
    });
    assert.equal('domain' in cookie.options, false);
  }
  assert.equal(sessionDurationSeconds, 604800);
});

test('configuração inválida e ambientes sem liberação nunca relaxam Secure', () => {
  for (const NODE_ENV of ['production', 'test', undefined, 'development']) {
    for (const PORTAL_PUBLIC_URL of [
      'inválida',
      'http://public.example.invalid',
      'https://usuario:senha@portal.example.invalid',
      'https://portal.example.invalid/path',
    ]) {
      assert.equal(
        sessionCookiePolicy({ NODE_ENV, PORTAL_PUBLIC_URL }).options.secure,
        true,
      );
    }
  }
  for (const NODE_ENV of ['production', 'test', undefined]) {
    assert.equal(sessionCookiePolicy({ NODE_ENV }).options.secure, true);
    assert.equal(
      sessionCookiePolicy({
        NODE_ENV,
        PORTAL_PUBLIC_URL: 'http://localhost:3002',
      }).options.secure,
      true,
    );
  }
});

test('origem TLS de laboratório não aceita destino público ou configuração incompleta', async () => {
  const { openTestEnvironment } = await import('./test-environment');
  for (const publicOrigin of [
    'inválida',
    'https://evil.invalid:9443',
    'http://localhost:9443',
    'https://localhost:9443/rota',
    'https://usuario:senha@localhost:9443',
  ]) {
    await assert.rejects(
      openTestEnvironment({ http: true, publicOrigin }),
      /Origem de laboratório/,
    );
  }
  await assert.rejects(
    openTestEnvironment({ publicOrigin: 'https://localhost:9443' }),
    /Origem de laboratório/,
  );
});
