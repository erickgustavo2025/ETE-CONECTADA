import assert from 'node:assert/strict';
import { withRepeaterSelections } from '../src/lib/school-repeater-input';
import type { SheetInput } from '../src/lib/sheet-import-input';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const input: SheetInput = {
  mode: 'SUBSEQUENTE',
  rows: [],
  inputHash: 'a'.repeat(64),
  contexts: [
    {
      sheetName: 'DS A',
      scopeId: first,
      className: 'STDSIN1A',
      courseLabel: 'DS',
      stage: 1,
      periodLabel: '2027.1',
      bindings: {},
      header: {
        classCode: 'STDSIN1A',
        schoolYear: 2027,
        reference: null,
        useExisting: false,
      },
    },
    {
      sheetName: 'DS B',
      scopeId: second,
      className: 'STDSIN1B',
      courseLabel: 'DS',
      stage: 1,
      periodLabel: '2027.1',
      bindings: {},
      header: {
        classCode: 'STDSIN1B',
        schoolYear: 2027,
        reference: null,
        useExisting: false,
      },
    },
  ],
};
const a = { enrollmentId: first, sheetName: 'DS A', version: 'b'.repeat(64) };
const b = { enrollmentId: second, sheetName: 'DS B', version: 'c'.repeat(64) };
assert.equal(
  withRepeaterSelections(input, undefined).inputHash,
  input.inputHash,
);
assert.notEqual(withRepeaterSelections(input, [a]).inputHash, input.inputHash);
assert.notEqual(
  withRepeaterSelections(input, [a]).inputHash,
  withRepeaterSelections(input, [{ ...a, sheetName: 'DS B' }]).inputHash,
);
assert.equal(
  withRepeaterSelections(input, [b, a]).inputHash,
  withRepeaterSelections(input, [a, b]).inputHash,
);
for (const value of [
  null,
  {},
  [a, a],
  [{ ...a, sheetName: 'Outra' }],
  [{ ...a, name: 'Não confiar no cliente' }],
  [{ ...a, version: 'errada' }],
  [{ ...a, enrollmentId: 'inválido' }],
  Array(101).fill(a),
])
  assert.throws(() => withRepeaterSelections(input, value));
assert.throws(() =>
  withRepeaterSelections(
    {
      ...input,
      contexts: input.contexts.map((c) => ({ ...c, header: undefined })),
    },
    [a],
  ),
);
console.log(
  'OK: seleção explícita, versão e turma entram na prévia; duplicatas e campos forjados recusados.',
);
