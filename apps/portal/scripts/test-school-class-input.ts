import assert from 'node:assert/strict';
import {
  readSchoolClassMetadata,
  estimateSubsequentReference,
} from '../src/lib/school-class-input';

const header = (period: string, stage: string, code: string) => [
  ['Alunos das Turmas'],
  ['ESCOLA FICTÍCIA - ' + period],
  ['Curso conferido pelo leitor'],
  [stage + ' - N - ' + code],
  [],
  [
    'Matrícula',
    'Nome',
    'Data de nascimento',
    '',
    '',
    '',
    '',
    '',
    'Filiação 1 e 2',
  ],
];
const ds = readSchoolClassMetadata(
  header('2026 /2', '1MODULO', 'STDSIN1U'),
  'SUBSEQUENTE',
  'DS',
  1,
);
assert.equal(ds.classCode, 'STDSIN1U');
assert.equal(ds.periodLabel, '2026.2');
assert.deepEqual(ds.reference, {
  entryPeriod: '2026.2',
  completionPeriod: '2027.2',
  startsOn: '2026-08-01',
  endsOn: '2027-12-31',
  totalModules: 3,
});
const second = readSchoolClassMetadata(
  header('2026 /2', '2MODULO', 'STDSIN2U'),
  'SUBSEQUENTE',
  'DS',
  2,
);
assert.equal(second.reference?.entryPeriod, '2026.1');
assert.equal(second.reference?.completionPeriod, '2027.1');
assert.equal(
  estimateSubsequentReference('ENF', 1, '2026.2').endsOn,
  '2028-07-31',
);
assert.equal(
  estimateSubsequentReference('ENF', 4, '2026.2').entryPeriod,
  '2025.1',
);
assert.equal(
  estimateSubsequentReference('ADM', 3, '2026.1').entryPeriod,
  '2025.1',
);
assert.throws(() => estimateSubsequentReference('DS', 4, '2026.2'));
assert.throws(() => estimateSubsequentReference('DS', 1, '2026.3'));
assert.throws(() => estimateSubsequentReference('DS', 0, '2026.2'));
assert.throws(() =>
  readSchoolClassMetadata(
    header('2026', '1MODULO', 'STDSIN1U'),
    'SUBSEQUENTE',
    'DS',
    1,
  ),
);
assert.throws(() =>
  readSchoolClassMetadata(
    header('2026 /3', '1MODULO', 'STDSIN1U'),
    'SUBSEQUENTE',
    'DS',
    1,
  ),
);
assert.throws(() =>
  readSchoolClassMetadata(
    header('2026 /2', '1MODULO', '<script>'),
    'SUBSEQUENTE',
    'DS',
    1,
  ),
);
assert.throws(() =>
  readSchoolClassMetadata(
    header('2026 /2', '1MODULO', 'STDSIN1U'),
    'SUBSEQUENTE',
    'DS',
    2,
  ),
);
const integrated = readSchoolClassMetadata(
  header('2026', '3ANO', 'TDS3IN-A'),
  'INTEGRADO',
  'DS',
  3,
);
assert.equal(integrated.periodLabel, '2026');
assert.equal(integrated.schoolYear, 2026);
assert.equal(integrated.reference, null);
assert.throws(() =>
  readSchoolClassMetadata(
    header('2026 /2', '1ANO', 'TDS1IN-A'),
    'INTEGRADO',
    'DS',
    1,
  ),
);
const a = readSchoolClassMetadata(
  header('2026 /2', '1MODULO', 'STADMN1A'),
  'SUBSEQUENTE',
  'ADM',
  1,
);
const b = readSchoolClassMetadata(
  header('2026 /2', '1MODULO', 'STADMN1B'),
  'SUBSEQUENTE',
  'ADM',
  1,
);
assert.notEqual(a.classCode, b.classCode);
console.log(
  'OK: turma/período do cabeçalho, A/B preservados, três/quatro módulos e estimativa sem completar turmas ausentes.',
);
