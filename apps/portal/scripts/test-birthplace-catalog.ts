import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  municipalities,
  validateDeclaredBirthplace,
} from '../src/lib/birthplace-catalog';

test('catálogo oficial mantém município na UF correta e devolve nome canônico', () => {
  assert.ok(
    municipalities('PE').some(
      (city) => city.id === '2611606' && city.name === 'Recife',
    ),
  );
  assert.deepEqual(
    validateDeclaredBirthplace({ state: 'PE', municipalityId: '2611606' }),
    {
      birthCity: 'Recife',
      birthState: 'PE',
      birthCountry: 'BR',
      birthplaceSource: 'STUDENT_DECLARATION',
    },
  );
  assert.ok(municipalities('DF').some((city) => city.name === 'Brasília'));
  assert.equal(municipalities('XX').length, 0);
  assert.equal(municipalities('__proto__').length, 0);
});

test('recusa local inexistente, UF trocada, texto livre e campos de outro cadastro', () => {
  for (const value of [
    null,
    [],
    'Recife',
    {},
    { state: 'SP', municipalityId: '2611606' },
    { state: 'PE', municipalityId: '0000000' },
    { state: 'pe', municipalityId: '2611606' },
    { state: 'PE', municipalityId: 2611606 },
    { state: 'PE', municipalityId: 'Recife' },
    { state: 'PE', municipalityId: '2611606', source: 'SCHOOL_RECORD' },
    { state: 'PE', municipalityId: '2611606', studentId: 'outro' },
    { state: 'PE', municipalityId: '2611606', birthCity: 'Outra cidade' },
  ])
    assert.throws(() => validateDeclaredBirthplace(value));
});
