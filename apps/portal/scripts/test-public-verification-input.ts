import assert from 'node:assert/strict';
import {
  readPublicVerificationQuery,
  maskDocumentName,
  documentNameMatches,
  verificationLink,
} from '../src/lib/public-verification-input';
const code = 'A'.repeat(43);
assert.deepEqual(readPublicVerificationQuery({ code }), {
  code,
  fullName: null,
});
assert.deepEqual(
  readPublicVerificationQuery({ code, fullName: '  Pessoa Fictícia  ' }),
  { code, fullName: 'Pessoa Fictícia' },
);
for (const value of [
  null,
  [],
  {},
  { code: 'a' },
  { code, role: 'secretary' },
  { code, studentId: '123' },
  { code, fullName: [] },
  { code, fullName: 'a'.repeat(181) },
  { code, fullName: 'a\nb' },
])
  assert.throws(() => readPublicVerificationQuery(value));
assert.equal(maskDocumentName('Tacyo Henrique Soares'), 'Tac*** Soa***');
assert.equal(maskDocumentName('Jo'), 'J***');
assert.equal(documentNameMatches('ÁLUNO  FICTÍCIO', 'aluno ficticio'), true);
assert.equal(documentNameMatches('Aluno Fictício', 'Aluno'), false);
assert.equal(
  verificationLink(code, 'https://portal.example.invalid'),
  'https://portal.example.invalid/validar/' + code,
);
assert.equal(
  verificationLink(code, 'http://127.0.0.1:3002', 'test'),
  'http://127.0.0.1:3002/validar/' + code,
);
for (const origin of [
  'https://evil.invalid/path',
  'https://u:p@example.invalid',
  'javascript:alert(1)',
  'https://portal.example.invalid/?a=1',
  'https://portal.example.invalid/#x',
  '',
])
  assert.throws(() => verificationLink(code, origin));
console.log(
  'OK: código/formulário estritos, nome mascarado/conferência sem retorno integral e origem canônica explícita.',
);

assert.throws(() =>
  verificationLink(code, 'http://127.0.0.1:3002', 'production'),
);

assert.equal(maskDocumentName('Ana Luz'), 'An*** Lu***');
assert.equal(maskDocumentName('A B'), '*** ***');
