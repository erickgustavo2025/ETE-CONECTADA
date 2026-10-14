import assert from 'node:assert/strict';
import {
  StudentDetailsError,
  validateStudentDetailsPatch,
} from '../src/lib/student-details';

const parentage = {
  parentOne: ' Responsável   Fictício Um ',
  source: 'SCHOOL_RECORD',
};
assert.deepEqual(validateStudentDetailsPatch({ parentage }), {
  parentOne: 'Responsável Fictício Um',
  parentageSource: 'SCHOOL_RECORD',
});
assert.deepEqual(
  validateStudentDetailsPatch({
    socialName: { value: null, source: 'SECRETARY_CORRECTION' },
  }),
  {
    socialName: null,
    socialNameSource: 'SECRETARY_CORRECTION',
  },
);
const brazil = {
  city: 'Recife',
  country: 'br',
  state: 'pe',
  source: 'STUDENT_DECLARATION',
};
assert.deepEqual(validateStudentDetailsPatch({ birthplace: brazil }), {
  birthCity: 'Recife',
  birthState: 'PE',
  birthCountry: 'BR',
  birthplaceSource: 'STUDENT_DECLARATION',
});
assert.equal(
  validateStudentDetailsPatch({
    birthplace: { city: 'Lisboa', country: 'PT', source: 'SCHOOL_RECORD' },
  }).birthState,
  null,
);
const invalid = [
  null,
  [],
  {},
  { fullName: 'Outro nome' },
  { parentage: { ...parentage, source: 'STUDENT_DECLARATION' } },
  { parentage: { ...parentage, parentOne: '' } },
  { parentage: { ...parentage, parentOne: 'x'.repeat(181) } },
  { parentage: { ...parentage, parentOne: 'Nome\nInjetado' } },
  { parentage: { ...parentage, parentTwo: '' } },
  { parentage: { ...parentage, parentTwo: null } },
  { parentage: { ...parentage, source: 'inventada' } },
  { socialName: { source: 'SCHOOL_RECORD' } },
  { birthplace: { ...brazil, state: 'XX' } },
  { birthplace: { ...brazil, country: 'PT' } },
  { birthplace: { ...brazil, city: '' } },
  { birthplace: { ...brazil, country: '123' } },
  { birthplace: { ...brazil, studentId: 'forjado' } },
];
for (const value of invalid)
  assert.throws(() => validateStudentDetailsPatch(value), StudentDetailsError);
console.log(
  `OK: 4 casos válidos e ${invalid.length} entradas inválidas de dados complementares.`,
);
