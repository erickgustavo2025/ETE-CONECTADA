import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  declarationBody,
  validateDeclarationFields,
  DeclarationValidationError,
} from '../src/lib/declarations';
import { subsequentFixture } from './subsequent-declaration-fixture';
const fields = (
  enrollment: ReturnType<typeof subsequentFixture>['enrollment'],
) =>
  validateDeclarationFields({
    enrollmentId: enrollment.id,
    naturality: 'Recife/PE',
    parentOne: 'Filiação fictícia',
    courseName: 'Curso enviado diferente do cadastro',
    schoolPeriod: enrollment.periodLabel,
    reviewed: true,
  });
test('subsequente usa curso e módulo do calendário, datas do curso e nenhuma frequência', () => {
  for (const course of ['ADM', 'DS', 'ENF'] as const)
    for (let number = 1; number <= (course === 'ENF' ? 4 : 3); number++) {
      const { student, enrollment, schedule } = subsequentFixture(
        course,
        number,
      );
      const body = declarationBody(student, fields(enrollment));
      assert.match(body, new RegExp(`${number}º módulo`));
      assert.match(body, /modalidade subsequente/);
      assert.match(body, /18h20 às 21h00/);
      assert.doesNotMatch(body, /frequência|100%|Ensino Médio|Curso enviado/);
      for (const date of [schedule.startsOn, schedule.endsOn]) {
        const formatted = new Intl.DateTimeFormat('pt-BR', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(date + 'T00:00:00Z'));
        assert.ok(body.includes(formatted));
      }
    }
});
test('calendário ausente, revisão antiga, curso/módulo/período/datas trocados não geram declaração', () => {
  const { student, enrollment } = subsequentFixture();
  for (const change of [
    { offering: null },
    { calendarRevision: 2 },
    { moduleNumber: 2 },
    { calendarModule: 2 },
    { periodLabel: enrollment.periodLabel + '-diferente' },
    { validUntil: new Date('1900-01-01') },
    { offering: { ...enrollment.offering, courseLabel: 'ADM' } },
  ]) {
    assert.throws(
      () =>
        declarationBody(
          { ...student, enrollments: [{ ...enrollment, ...change }] },
          fields(enrollment),
        ),
      DeclarationValidationError,
    );
  }
});

test('turmas DS com mesmo nome e ingressos distintos preservam seus próprios módulos e datas', () => {
  const first = subsequentFixture('DS', 1);
  const second = subsequentFixture('DS', 2);
  assert.equal(first.schedule.label, second.schedule.label);
  assert.notEqual(first.enrollment.offeringId, second.enrollment.offeringId);
  assert.notEqual(first.schedule.startsOn, second.schedule.startsOn);
  const a = declarationBody(first.student, fields(first.enrollment));
  const b = declarationBody(second.student, fields(second.enrollment));
  assert.match(a, /1º módulo/);
  assert.match(b, /2º módulo/);
  assert.notEqual(a, b);
});
