import assert from 'node:assert/strict';
import {
  nextAcademicStage,
  promotionIsDue,
  dayBeforePromotion,
} from '../src/lib/school-promotion-input';

assert.deepEqual(
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'DS',
    stage: 1,
    periodLabel: '2026.2',
  }),
  {
    stage: 2,
    periodLabel: '2027.1',
    schoolYear: 2027,
    effectiveOn: '2027-02-01',
  },
);
assert.deepEqual(
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'ADM',
    stage: 2,
    periodLabel: '2026.1',
  }),
  {
    stage: 3,
    periodLabel: '2026.2',
    schoolYear: 2026,
    effectiveOn: '2026-08-01',
  },
);
assert.deepEqual(
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'ENF',
    stage: 3,
    periodLabel: '2026.2',
  }),
  {
    stage: 4,
    periodLabel: '2027.1',
    schoolYear: 2027,
    effectiveOn: '2027-02-01',
  },
);
assert.deepEqual(
  nextAcademicStage({
    mode: 'INTEGRADO',
    courseLabel: 'DS',
    stage: 1,
    periodLabel: '2026',
  }),
  {
    stage: 2,
    periodLabel: '2027',
    schoolYear: 2027,
    effectiveOn: '2027-02-01',
  },
);
for (const courseLabel of ['ADM', 'DS'] as const)
  assert.throws(() =>
    nextAcademicStage({
      mode: 'SUBSEQUENTE',
      courseLabel,
      stage: 3,
      periodLabel: '2026.2',
    }),
  );
assert.throws(() =>
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'ENF',
    stage: 4,
    periodLabel: '2026.2',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'INTEGRADO',
    courseLabel: 'ADM',
    stage: 3,
    periodLabel: '2026',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'INTEGRADO',
    courseLabel: 'ENF',
    stage: 1,
    periodLabel: '2026',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'DS',
    stage: 0,
    periodLabel: '2026.2',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'DS',
    stage: 1.5,
    periodLabel: '2026.2',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'SUBSEQUENTE',
    courseLabel: 'DS',
    stage: 1,
    periodLabel: '2026.3',
  }),
);
assert.throws(() =>
  nextAcademicStage({
    mode: 'INTEGRADO',
    courseLabel: 'DS',
    stage: 1,
    periodLabel: '2026.2',
  }),
);
assert.equal(
  promotionIsDue('2027-02-01', new Date('2027-02-01T02:59:59Z')),
  false,
  'Ainda é31/01emRecife.',
);
assert.equal(
  promotionIsDue('2027-02-01', new Date('2027-02-01T03:00:00Z')),
  true,
);
assert.equal(
  promotionIsDue('2026-08-01', new Date('2026-08-01T02:59:59Z')),
  false,
);
assert.equal(
  promotionIsDue('2026-08-01', new Date('2026-08-01T03:00:00Z')),
  true,
);
assert.equal(dayBeforePromotion('2027-02-01'), '2027-01-31');
assert.equal(dayBeforePromotion('2026-08-01'), '2026-07-31');
assert.throws(() => promotionIsDue('2027-02-30'));
assert.throws(() => promotionIsDue('2027-02-01', new Date(NaN)));
console.log(
  'OK: passagem semestral/anual separada, limites3/4, data de Recife e manutenção da etapa anterior até a fronteira.',
);
