import assert from 'node:assert/strict';
import {
  nextAcademicStage,
  promotionIsDue,
  dayBeforePromotion,
  automaticPromotionDecision,
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

// A aprovação normal não exige plano confirmado nem clique de promoção.
const eligible = {
  mode: 'SUBSEQUENTE' as const,
  courseLabel: 'DS' as const,
  stage: 1,
  periodLabel: '2026.2',
  status: 'ACTIVE',
  reviewedAt: new Date('2026-08-01T12:00:00Z'),
  repetitionPending: false,
  progressionHeld: false,
};
assert.equal(
  automaticPromotionDecision(eligible, new Date('2027-02-01T02:59:59Z')).kind,
  'wait',
);
const due = automaticPromotionDecision(
  eligible,
  new Date('2027-02-01T03:00:00Z'),
);
assert.equal(due.kind, 'advance');
if (due.kind === 'advance') {
  assert.equal(due.next.stage, 2);
  assert.equal(due.next.periodLabel, '2027.1');
  // Reavaliar a matrícula já atualizada não repete a passagem na mesma data.
  const updated = {
    ...eligible,
    stage: due.next.stage,
    periodLabel: due.next.periodLabel,
  };
  assert.equal(
    automaticPromotionDecision(updated, new Date('2027-02-01T03:00:00Z')).kind,
    'wait',
  );
}
for (const month of [
  '2026-12-20T12:00:00Z',
  '2027-01-01T12:00:00Z',
  '2027-01-31T23:00:00Z',
]) {
  const result = automaticPromotionDecision(eligible, new Date(month));
  assert.equal(result.kind, 'wait', 'Férias não antecipam a etapa seguinte.');
  if (result.kind === 'wait')
    assert.equal(result.next.effectiveOn, '2027-02-01');
}
for (const status of ['UNCONFIRMED', 'ENDED'])
  assert.deepEqual(
    automaticPromotionDecision(
      { ...eligible, status },
      new Date('2027-02-01T12:00:00Z'),
    ),
    { kind: 'blocked', reason: 'ENROLLMENT' },
  );
assert.deepEqual(
  automaticPromotionDecision(
    { ...eligible, reviewedAt: null },
    new Date('2027-02-01T12:00:00Z'),
  ),
  { kind: 'blocked', reason: 'ENROLLMENT' },
);
assert.deepEqual(
  automaticPromotionDecision(
    { ...eligible, reviewedAt: new Date(NaN) },
    new Date('2027-02-01T12:00:00Z'),
  ),
  { kind: 'blocked', reason: 'ENROLLMENT' },
);
assert.deepEqual(
  automaticPromotionDecision(
    { ...eligible, repetitionPending: true },
    new Date('2027-02-01T12:00:00Z'),
  ),
  { kind: 'blocked', reason: 'REPETITION' },
);
assert.deepEqual(
  automaticPromotionDecision(
    { ...eligible, progressionHeld: true },
    new Date('2027-02-01T12:00:00Z'),
  ),
  { kind: 'blocked', reason: 'HOLD' },
);
for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const)
  for (const courseLabel of ['ADM', 'DS', 'ENF'] as const) {
    if (mode === 'INTEGRADO' && courseLabel === 'ENF') continue;
    const limit = courseLabel === 'ENF' ? 4 : 3;
    const source = {
      ...eligible,
      mode,
      courseLabel,
      stage: limit,
      periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
    };
    assert.deepEqual(
      automaticPromotionDecision(source, new Date('2027-02-01T12:00:00Z')),
      { kind: 'final-stage' },
      'Última etapa não significa curso concluído.',
    );
    assert.throws(() =>
      automaticPromotionDecision(
        { ...source, stage: limit + 1 },
        new Date('2027-02-01T12:00:00Z'),
      ),
    );
  }
const integrated = {
  ...eligible,
  mode: 'INTEGRADO' as const,
  periodLabel: '2026',
};
assert.equal(
  automaticPromotionDecision(integrated, new Date('2027-01-31T23:00:00Z')).kind,
  'wait',
);
assert.equal(
  automaticPromotionDecision(integrated, new Date('2027-02-01T03:00:00Z')).kind,
  'advance',
);
assert.throws(() => automaticPromotionDecision(eligible, new Date(NaN)));
console.log(
  'OK: decisão automática sem confirmação manual, férias, repetência, suspensão, vínculos inativos e conclusão não presumida.',
);

assert.deepEqual(
  automaticPromotionDecision(
    { ...eligible, reviewedAt: new Date('2028-01-01T12:00:00Z') },
    new Date('2027-02-01T12:00:00Z'),
  ),
  { kind: 'blocked', reason: 'ENROLLMENT' },
);
assert.throws(() =>
  automaticPromotionDecision(
    { ...eligible, periodLabel: '2026.3' },
    new Date('2027-02-01T12:00:00Z'),
  ),
);
assert.throws(() =>
  automaticPromotionDecision(
    { ...eligible, stage: 3, periodLabel: 'inválido' },
    new Date('2027-02-01T12:00:00Z'),
  ),
);
for (const courseLabel of ['ADM', 'DS', 'ENF'] as const) {
  const limit = courseLabel === 'ENF' ? 4 : 3;
  for (let stage = 1; stage < limit; stage++) {
    const source = {
      ...eligible,
      courseLabel,
      stage,
      periodLabel: '2026.1',
      reviewedAt: new Date('2026-02-01T12:00:00Z'),
    };
    assert.equal(
      automaticPromotionDecision(source, new Date('2026-08-01T02:59:59Z')).kind,
      'wait',
    );
    const result = automaticPromotionDecision(
      source,
      new Date('2026-08-01T03:00:00Z'),
    );
    assert.equal(result.kind, 'advance');
    if (result.kind === 'advance') assert.equal(result.next.stage, stage + 1);
  }
}
console.log(
  'OK: todas as transições ADM/DS/ENF na fronteira de agosto, revisão futura recusada e dados inválidos na etapa final.',
);
