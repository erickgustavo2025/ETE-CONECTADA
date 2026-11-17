import { isRequestSummary } from '../src/lib/declaration-request-types';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  readIssuanceInput,
  testIssuanceContent,
} from '../src/lib/declaration-issuance-input';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { subsequentFixture } from './subsequent-declaration-fixture';

const enrollmentId = randomUUID(),
  requestKey = randomUUID();
assert.deepEqual(readIssuanceInput({ enrollmentId, requestKey }), {
  enrollmentId,
  requestKey,
});
for (const input of [
  null,
  [],
  {},
  { enrollmentId, requestKey: 'x' },
  { enrollmentId, requestKey, role: 'secretary' },
  { enrollmentId, requestKey, studentId: randomUUID() },
])
  assert.throws(() => readIssuanceInput(input));
const student = {
  id: randomUUID(),
  fullName: 'Aluno fictício',
  cpf: null,
  birthDate: new Date('2000-01-01'),
  schoolRegistration: '0000001',
  details: {
    parentOne: 'Filiação fictícia',
    parentTwo: null,
    socialName: null,
    birthCity: 'Recife',
    birthState: 'PE',
    birthCountry: 'BR',
    birthplaceSource: 'SCHOOL_RECORD' as const,
  },
  enrollments: [
    {
      id: enrollmentId,
      mode: 'INTEGRADO' as const,
      className: 'Turma fictícia',
      grade: 2,
      courseLabel: 'DS',
      schoolYear: 2026,
      moduleNumber: null,
      offeringId: null,
      calendarModule: null,
      calendarRevision: null,
      entryStartedOn: null,
      offering: null,
      ...syntheticEnrollmentValidity(),
    },
  ],
};
const content = testIssuanceContent(student, enrollmentId);
assert.equal(content.snapshot.subjectName, student.fullName);
assert.equal(content.snapshot.testOnly, true);
assert.match(content.snapshot.body, /100%/);
assert.equal(content.fields.reviewed, true);
assert.throws(() => testIssuanceContent(student, randomUUID()));
assert.throws(() =>
  testIssuanceContent({ ...student, details: null }, enrollmentId),
);
const f = subsequentFixture();
const sub = testIssuanceContent(
  { ...f.student, details: student.details },
  f.enrollment.id,
);
assert.ok(!sub.snapshot.body.includes('frequência'));
assert.equal(sub.snapshot.moduleNumber, 1);
console.log(
  'OK: emissão usa identidade, curso e filiação do registro escolar, com dados de teste explícitos.',
);

const summary = {
  id: randomUUID(),
  enrollmentId,
  status: 'AVAILABLE',
  createdAt: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  readyAt: null,
  className: 'Turma fictícia',
  document: { id: randomUUID(), state: 'ISSUED' },
};
assert.equal(isRequestSummary(summary), true);
for (const value of [
  null,
  {},
  { ...summary, createdAt: 'data desconhecida' },
  { ...summary, document: null },
  { ...summary, status: 'outra' },
  { ...summary, document: { ...summary.document, state: 'DRAFT' } },
])
  assert.equal(isRequestSummary(value), false);
