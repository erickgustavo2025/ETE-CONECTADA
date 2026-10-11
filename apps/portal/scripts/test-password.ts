import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/lib/password';

const password = 'Senha sintética@123';
const salt = '000102030405060708090a0b0c0d0e0f';
// Referência independente: Python hashlib.scrypt, N=16384, r=8, p=1, dklen=64.
const digest = '1032c7e8fdac843b634018735677f8c8a46c0e9654e809ca0ce0b1b0ef9a43089175a3cf414588dcb0eca8f3edeff1bcb6f63c51786db1b6dabe0cfb135ea2e7';
const reference = `scrypt$${salt}$${digest}`;

test('confere uma referência independente e recusa senha ou digest alterados', async () => {
  assert.equal(await verifyPassword(password, reference), true);
  assert.equal(await verifyPassword('Senha incorreta@123', reference), false);
  assert.equal(await verifyPassword(password, `scrypt$${salt}$${digest.slice(0, -1)}8`), false);
});

test('gera hashes distintos para a mesma senha, sem armazenar texto puro', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$[a-f\d]{32}\$[a-f\d]{128}$/);
  assert.match(second, /^scrypt\$[a-f\d]{32}\$[a-f\d]{128}$/);
  assert.notEqual(first.split('$')[1], second.split('$')[1]);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password, second), true);
});

test('preserva a senha completa nos limites de 8 e 128 caracteres aceitos pelo cadastro', async () => {
  for (const value of ['Abcd123!', 'A'.repeat(127) + '!']) {
    const encoded = await hashPassword(value);
    assert.equal(await verifyPassword(value, encoded), true);
    assert.equal(await verifyPassword(value.slice(0, -1) + '?', encoded), false);
    assert.equal(await verifyPassword(value.slice(0, -1), encoded), false);
  }
});

test('preserva Unicode, espaços e conteúdo após caractere nulo', async () => {
  const value = '  AbçΩ漢😀\u0000fim  ';
  const encoded = await hashPassword(value);
  assert.equal(await verifyPassword(value, encoded), true);
  assert.equal(await verifyPassword(value.trim(), encoded), false);
  assert.equal(await verifyPassword('  AbçΩ漢😀', encoded), false);
  assert.equal(await verifyPassword(value.replace('fim', 'outro'), encoded), false);
});

test('hash malformado retorna false sem lançar erro ou autenticar', async () => {
  const malformed = [
    '',
    'scrypt',
    `argon2$${salt}$${digest}`,
    `scrypt$${salt}`,
    `scrypt$$${digest}`,
    `scrypt$${salt.slice(2)}$${digest}`,
    `scrypt$${salt}00$${digest}`,
    `scrypt$g${salt.slice(1)}$${digest}`,
    `scrypt$${salt}$${digest.slice(2)}`,
    `scrypt$${salt}$${digest}00`,
    `scrypt$${salt}$z${digest.slice(1)}`,
    `${reference}$extra`,
    `${reference}$`,
  ];
  for (const encoded of malformed) {
    assert.equal(await verifyPassword(password, encoded), false);
  }
});
