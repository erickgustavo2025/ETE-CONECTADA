import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import {
  declarationBody,
  DeclarationValidationError,
  validateDeclarationFields,
  declarationDefaults,
  studentView,
  type DeclarationStudent,
} from '../src/lib/declarations';

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const otherEnrollmentId = '00000000-0000-4000-8000-000000000002';
const valid = {
  enrollmentId,
  naturality: 'Cidade fictícia/PE',
  parentOne: 'Responsável fictício',
  courseName: 'Curso fictício',
  schoolPeriod: '2026',
  reviewed: true,
};
const frequency = {
  ...valid,
  includeFrequency: true,
  frequencyPercent: '100',
  frequencyStart: '2026-01-01',
  frequencyEnd: '2026-10-12',
};
const student: DeclarationStudent = {
  id: '00000000-0000-4000-8000-000000000003',
  fullName: 'Estudante fictício',
  schoolRegistration: '00000001',
  cpf: null,
  birthDate: new Date('2008-02-29T00:00:00Z'),
  details: null,
  enrollments: [
    {
      ...syntheticEnrollmentValidity(),
      id: enrollmentId,
      mode: 'INTEGRADO',
      moduleNumber: null,
      offeringId: null,
      calendarModule: null,
      calendarRevision: null,
      offering: null,
      className: 'Turma fictícia',
      grade: 2,
      courseLabel: 'Curso fictício',
      schoolYear: 2026,
    },
  ],
};

test('preenche dados escolares e local de nascimento sem copiar dados de outro aluno', () => {
  const person = {
    ...student,
    details: {
      parentOne: 'Filiação do cadastro',
      parentTwo: null,
      socialName: 'Nome social fictício',
      birthCity: 'Recife',
      birthState: 'PE',
      birthCountry: 'BR',
      birthplaceSource: 'STUDENT_DECLARATION' as const,
    },
    enrollments: student.enrollments.map((row) => ({
      ...row,
      courseLabel: 'DS',
    })),
  };
  const fields = declarationDefaults(studentView(person));
  assert.equal(fields.parentOne, 'Filiação do cadastro');
  assert.equal(fields.parentTwo, '');
  assert.equal(fields.socialName, 'Nome social fictício');
  assert.equal(fields.naturality, 'Recife/PE');
  assert.equal(fields.courseName, 'Desenvolvimento de Sistemas');
  assert.equal(fields.schoolPeriod, '2026');
  assert.equal(declarationDefaults(studentView(student)).parentOne, '');
});

test('integrado sempre usa 100% inclusive diante de alteração do percentual enviado', () => {
  const body = declarationBody(
    student,
    validateDeclarationFields({ ...frequency, frequencyPercent: '1' }),
  );
  assert.match(body, /100%/);
  assert.doesNotMatch(body, /de 1%/);
});

function rejects(value: unknown, field?: string) {
  assert.throws(
    () => validateDeclarationFields(value),
    (error: unknown) => {
      assert.ok(error instanceof DeclarationValidationError);
      if (field) assert.equal(error.field, field);
      return true;
    },
  );
}

test('exige corpo, campos obrigatórios e confirmação explícita da conferência', () => {
  for (const value of [null, undefined, false, 'texto']) rejects(value);
  for (const key of [
    'enrollmentId',
    'naturality',
    'parentOne',
    'courseName',
    'schoolPeriod',
  ]) {
    rejects({ ...valid, [key]: ' ' }, key);
    rejects({ ...valid, [key]: 123 }, key);
  }
  for (const reviewed of [false, undefined, 'true', 1])
    rejects({ ...valid, reviewed }, 'reviewed');
  rejects({ ...valid, enrollmentId: 'matrícula inválida' });
});

test('normaliza espaços e preserva campos opcionais vazios sem frequência', () => {
  const fields = validateDeclarationFields({
    ...valid,
    naturality: '  Cidade   fictícia/PE  ',
  });
  assert.equal(fields.naturality, 'Cidade fictícia/PE');
  assert.equal(fields.parentTwo, '');
  assert.equal(fields.secretaryName, '');
  assert.equal(fields.includeFrequency, false);
  assert.equal(fields.frequencyPercent, '');
  assert.match(declarationBody(student, fields), /100%/);
});

test('respeita limites dos textos e rejeita controles no conteúdo', () => {
  for (const [field, max] of [
    ['naturality', 120],
    ['parentOne', 180],
    ['schoolPeriod', 60],
  ] as const) {
    assert.equal(
      validateDeclarationFields({ ...valid, [field]: 'A'.repeat(max) })[field]
        .length,
      max,
    );
    rejects({ ...valid, [field]: 'A'.repeat(max + 1) }, field);
    for (const control of ['\u0000', '\u0001', '\u007f'])
      rejects({ ...valid, [field]: `Texto${control}` }, field);
  }
});

test('quando inclui frequência, exige percentual e as duas datas', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-12T15:00:00Z'),
  });
  for (const key of ['frequencyPercent', 'frequencyStart', 'frequencyEnd'])
    rejects({ ...frequency, [key]: '' }, key);
});

test('valida limites 0/100 e normaliza duas casas decimais com vírgula', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-12T15:00:00Z'),
  });
  for (const value of ['0', '100', '100.00', '99,25']) {
    assert.equal(
      validateDeclarationFields({ ...frequency, frequencyPercent: value })
        .frequencyPercent,
      value.replace(',', '.'),
    );
  }
  for (const value of [
    '-1',
    '100.01',
    '101',
    '1.234',
    'NaN',
    '1e2',
    '50%',
    '+50',
  ])
    rejects({ ...frequency, frequencyPercent: value }, 'frequencyPercent');
});

test('recusa datas impossíveis e aceita dia bissexto existente', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-12T15:00:00Z'),
  });
  for (const key of ['frequencyStart', 'frequencyEnd']) {
    for (const value of [
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-00-01',
      '2026-01-00',
      '2026-1-01',
      '12/10/2026',
    ])
      rejects({ ...frequency, [key]: value }, key);
  }
  assert.equal(
    validateDeclarationFields({ ...frequency, frequencyStart: '2024-02-29' })
      .frequencyStart,
    '2024-02-29',
  );
});

test('aceita intervalo de um dia e recusa intervalo invertido ou futuro no fuso da escola', (t) => {
  // 02:30 UTC ainda é 11/10 em Recife: evita depender do fuso da máquina.
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-12T02:30:00Z'),
  });
  assert.equal(
    validateDeclarationFields({
      ...frequency,
      frequencyStart: '2026-10-11',
      frequencyEnd: '2026-10-11',
    }).frequencyEnd,
    '2026-10-11',
  );
  rejects(
    { ...frequency, frequencyStart: '2026-10-11', frequencyEnd: '2026-10-10' },
    'frequencyEnd',
  );
  rejects(frequency, 'frequencyEnd');
});

test('recusa matrícula de outro aluno e subsequente sem calendário', () => {
  assert.throws(
    () =>
      declarationBody(
        student,
        validateDeclarationFields({
          ...valid,
          enrollmentId: otherEnrollmentId,
        }),
      ),
    /não pertence ao aluno/,
  );
  assert.throws(
    () =>
      declarationBody(
        {
          ...student,
          enrollments: [{ ...student.enrollments[0], mode: 'SUBSEQUENTE' }],
        },
        validateDeclarationFields(valid),
      ),
    /calendário, o módulo e a vigência/,
  );
});

test('exige nome e série no cadastro antes de compor a declaração', () => {
  const fields = validateDeclarationFields(valid);
  assert.throws(
    () => declarationBody({ ...student, fullName: '' }, fields),
    /nome e série completos/,
  );
  assert.throws(
    () =>
      declarationBody(
        {
          ...student,
          enrollments: [{ ...student.enrollments[0], grade: null }],
        },
        fields,
      ),
    /nome e série completos/,
  );
});

test('compõe texto fictício com frequência validada sem inventar CPF ou segunda filiação', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-12T15:00:00Z'),
  });
  const body = declarationBody(
    student,
    validateDeclarationFields({ ...frequency, frequencyPercent: '99,25' }),
  );
  assert.match(body, /Estudante fictício, nascido\(a\) em 29\/02\/2008/);
  assert.match(body, /2º ano/);
  assert.match(body, /frequência registrada no período letivo é de 100%/);
  assert.equal(body.includes('CPF'), false);
  assert.equal(body.includes('undefined'), false);
});

test('rótulo legado de curso não é resolvido por propriedades do protótipo', () => {
  for (const code of ['constructor', '__proto__', 'toString']) {
    const view = studentView({
      ...student,
      enrollments: student.enrollments.map((row) => ({
        ...row,
        courseLabel: code,
      })),
    });
    assert.equal(declarationDefaults(view).courseName, code);
  }
});
