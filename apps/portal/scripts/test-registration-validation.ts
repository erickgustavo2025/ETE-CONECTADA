import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeCpf,
  normalizeEmail,
  normalizeSchoolRegistration,
  validBirthDate,
} from '../src/lib/registration';

test('normaliza CPF com pontuação e aceita dígitos verificadores válidos', () => {
  assert.equal(normalizeCpf('45278196319'), '45278196319');
  assert.equal(normalizeCpf('452.781.963-19'), '45278196319');
  assert.equal(normalizeCpf('63820517480'), '63820517480');
});

test('recusa CPF com cada dígito verificador alterado, repetido ou de tipo desconhecido', () => {
  const cpf = '45278196319';
  const alter = (index: number) => `${cpf.slice(0, index)}${cpf[index] === '9' ? '0' : '9'}${cpf.slice(index + 1)}`;

  assert.equal(normalizeCpf(alter(9)), null);
  assert.equal(normalizeCpf(alter(10)), null);
  for (const digit of '0123456789') {
    assert.equal(normalizeCpf(digit.repeat(11)), null, `CPF repetido: ${digit}`);
  }
  assert.equal(normalizeCpf('1234567890'), null);
  assert.equal(normalizeCpf('123456789012'), null);
  assert.equal(normalizeCpf(''), null);
  assert.equal(normalizeCpf(undefined), null);
  assert.equal(normalizeCpf(12345678909), null);
});

test('aceita matrículas de 7 ou 8 dígitos, preservando zeros e removendo espaços externos', () => {
  assert.equal(normalizeSchoolRegistration(' 0123456 '), '0123456');
  assert.equal(normalizeSchoolRegistration('00123456'), '00123456');
});

test('recusa matrículas fora dos limites ou que não sejam strings numéricas', () => {
  for (const value of ['123456', '123456789', '12 34567', '', '   ', 1234567, null, undefined]) {
    assert.equal(normalizeSchoolRegistration(value), null, `valor recusado: ${String(value)}`);
  }
});

test('normaliza e-mail conforme o formato simples do contrato atual', () => {
  assert.equal(normalizeEmail('  Aluno+teste@EXEMPLO.COM  '), 'aluno+teste@exemplo.com');
});

test('aceita e-mail com 254 caracteres e recusa com 255', () => {
  const email254 = `${'a'.repeat(64)}@${'b'.repeat(187)}.c`;
  const email255 = `${'a'.repeat(65)}@${'b'.repeat(187)}.c`;

  assert.equal(email254.length, 254);
  assert.equal(email255.length, 255);
  assert.equal(normalizeEmail(email254), email254);
  assert.equal(normalizeEmail(email255), null);
});

test('recusa e-mails vazios, com espaços, sem domínio ou com separadores ausentes', () => {
  for (const value of ['', '   ', 'a b@exemplo.com', 'a@sub dominio.com', 'a@exemplo', '@exemplo.com', 'a@@exemplo.com', null, undefined, 12]) {
    assert.equal(normalizeEmail(value), null, `valor recusado: ${String(value)}`);
  }
});

test('valida datas existentes, anos bissextos e relógio determinístico para hoje e futuro', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-11T12:00:00.000Z') });

  assert.equal(validBirthDate('2000-02-29'), true);
  assert.equal(validBirthDate('2024-02-29'), true);
  assert.equal(validBirthDate('2023-02-29'), false);
  assert.equal(validBirthDate('1900-02-29'), false);
  assert.equal(validBirthDate('2026-10-11'), true);
  assert.equal(validBirthDate('2026-10-12'), false);
});

test('recusa nascimento impossível, vazio ou de tipo desconhecido', () => {
  for (const value of [
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-04-00',
    '2026-4-01',
    '2026-04-1',
    '',
    '11/10/2026',
    null,
    undefined,
    20261011,
  ]) {
    assert.equal(validBirthDate(value), false, `valor recusado: ${String(value)}`);
  }
});
