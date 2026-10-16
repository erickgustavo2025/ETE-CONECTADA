import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readCalendarDraft,
  moduleOnDate,
  calendarEnded,
  CalendarError,
} from '../src/lib/course-calendar-input';
const draft = () => ({
  label: 'DS · oferta sintética julho 2026',
  courseLabel: 'DS',
  startsOn: '2026-07-01',
  endsOn: '2027-12-31',
  modules: [
    {
      number: 1,
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      periodLabel: '2026.2',
    },
    {
      number: 2,
      startsOn: '2027-02-01',
      endsOn: '2027-07-31',
      periodLabel: '2027.1',
    },
    {
      number: 3,
      startsOn: '2027-08-01',
      endsOn: '2027-12-31',
      periodLabel: '2027.2',
    },
  ],
});
test('calendário: três módulos ADM/DS, quatro ENF e datas oficiais sem presumir semestres', () => {
  for (const courseLabel of ['ADM', 'DS'])
    assert.equal(
      readCalendarDraft({ ...draft(), courseLabel }).modules.length,
      3,
    );
  const data = draft();
  const calendar = readCalendarDraft(data);
  assert.equal(
    moduleOnDate(calendar, new Date('2026-07-01T02:59:59.999Z')),
    null,
  );
  assert.equal(
    moduleOnDate(calendar, new Date('2026-07-01T03:00:00Z'))?.number,
    1,
  );
  assert.equal(
    moduleOnDate(calendar, new Date('2027-02-01T02:59:59.999Z'))?.number,
    1,
    'Férias não inventam outro módulo.',
  );
  assert.equal(
    moduleOnDate(calendar, new Date('2027-02-01T03:00:00Z'))?.number,
    2,
  );
  assert.equal(
    moduleOnDate(calendar, new Date('2029-01-01T03:00:00Z'))?.number,
    3,
    'Não passa do último módulo.',
  );
  assert.equal(
    calendarEnded(calendar, new Date('2028-01-01T02:59:59.999Z')),
    false,
  );
  assert.equal(calendarEnded(calendar, new Date('2028-01-01T03:00:00Z')), true);
  const nursing = readCalendarDraft({
    ...data,
    courseLabel: 'ENF',
    endsOn: '2028-07-31',
    modules: [
      ...data.modules,
      {
        number: 4,
        startsOn: '2028-02-01',
        endsOn: '2028-07-31',
        periodLabel: '2028.1',
      },
    ],
  });
  assert.equal(
    moduleOnDate(nursing, new Date('2028-02-01T03:00:00Z'))?.number,
    4,
  );
  assert.equal(
    moduleOnDate(nursing, new Date('2026-10-01T03:00:00Z'))?.number,
    1,
  );
  assert.equal(
    moduleOnDate(calendar, new Date('2026-10-01T03:00:00Z'))?.number,
    1,
  );
});
test('calendário: recusa campos inventados, limites, datas inválidas, módulos faltantes e sobrepostos', () => {
  const base = draft();
  const invalid = [
    null,
    [],
    {},
    { ...base, studentId: 'x' },
    { ...base, label: '' },
    { ...base, label: 'x'.repeat(121) },
    { ...base, label: 'turma\u0000' },
    { ...base, courseLabel: 'ENFERMAGEM' },
    { ...base, startsOn: '2026-02-30' },
    { ...base, endsOn: '2026-06-30' },
    { ...base, startsOn: '2026-08-01' },
    { ...base, modules: base.modules.slice(0, 2) },
    { ...base, modules: [...base.modules, { ...base.modules[2], number: 4 }] },
    {
      ...base,
      modules: base.modules.map((m, i) => (i === 1 ? { ...m, number: 1 } : m)),
    },
    {
      ...base,
      modules: base.modules.map((m, i) =>
        i === 1 ? { ...m, startsOn: '2026-12-31' } : m,
      ),
    },
    {
      ...base,
      modules: base.modules.map((m, i) =>
        i === 0 ? { ...m, endsOn: '2026-06-30' } : m,
      ),
    },
    {
      ...base,
      modules: base.modules.map((m, i) =>
        i === 0 ? { ...m, periodLabel: '' } : m,
      ),
    },
    {
      ...base,
      modules: base.modules.map((m, i) =>
        i === 0 ? { ...m, periodLabel: 'x'.repeat(61) } : m,
      ),
    },
    {
      ...base,
      modules: base.modules.map((m, i) =>
        i === 0 ? { ...m, extra: true } : m,
      ),
    },
  ];
  for (const value of invalid)
    assert.throws(() => readCalendarDraft(value), CalendarError);
});

test('progressão: idempotência, correção escolar, revisão pendente, encerrado e integrado', async () => {
  const { progressionDecision } =
    await import('../src/lib/course-calendar-input');
  const calendar = readCalendarDraft(draft()),
    now = new Date('2027-02-01T03:00:00Z');
  const row = {
    mode: 'SUBSEQUENTE',
    status: 'ACTIVE',
    offeringId: 'offering',
    progressionHeld: false,
    moduleNumber: 1,
    calendarModule: 1,
  };
  assert.equal(progressionDecision(row, calendar, now).kind, 'advance');
  assert.equal(
    progressionDecision(
      { ...row, moduleNumber: 2, calendarModule: 2 },
      calendar,
      now,
    ).kind,
    'none',
  );
  assert.equal(
    progressionDecision({ ...row, moduleNumber: 2 }, calendar, now).kind,
    'hold',
    'Não desfaz correção da escola.',
  );
  for (const value of [
    { ...row, mode: 'INTEGRADO' },
    { ...row, status: 'ENDED' },
    { ...row, status: 'UNCONFIRMED' },
    { ...row, progressionHeld: true },
    { ...row, offeringId: null },
  ])
    assert.equal(progressionDecision(value, calendar, now).kind, 'none');
  assert.equal(
    progressionDecision(
      { ...row, moduleNumber: 3, calendarModule: 3 },
      calendar,
      now,
    ).kind,
    'none',
    'Calendário corrigido não regride matrícula.',
  );
});
