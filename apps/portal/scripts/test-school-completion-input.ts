import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readCompletionInput } from '../src/lib/school-completion-input';
const context = {
  mode: 'INTEGRADO',
  courseLabel: 'DS',
  className: '3A DS',
  periodLabel: '2026',
};
const first = { enrollmentId: randomUUID(), version: 'a'.repeat(64) },
  second = { enrollmentId: randomUUID(), version: 'b'.repeat(64) };
const preview = {
  operation: 'preview',
  context,
  selections: [first, second],
  reason: ' Conclusão\nconferida. ',
};
const parsed = readCompletionInput(preview);
assert.equal(parsed.operation, 'preview');
assert.equal('reason' in parsed && parsed.reason, 'Conclusão conferida.');
assert.deepEqual(readCompletionInput({ operation: 'candidates', context }), {
  operation: 'candidates',
  context,
  page: 1,
});
assert.deepEqual(
  readCompletionInput({ ...preview, selections: [second, first] }),
  parsed,
);
const confirm = {
  ...preview,
  operation: 'confirm',
  requestKey: randomUUID(),
  previewVersion: 'f'.repeat(64),
  confirmed: true,
};
assert.equal(readCompletionInput(confirm).operation, 'confirm');
for (const value of [
  null,
  {},
  { ...preview, role: 'secretary' },
  { ...preview, selections: [] },
  { ...preview, selections: [first, first] },
  {
    ...preview,
    selections: Array.from({ length: 101 }, () => ({
      enrollmentId: randomUUID(),
      version: 'a'.repeat(64),
    })),
  },
  { ...preview, selections: [{ ...first, name: 'Falso' }] },
  { ...preview, selections: [{ ...first, version: 'falso' }] },
  { ...preview, reason: 'x\u0000' },
  { ...preview, reason: 'x'.repeat(501) },
  { ...preview, reason: '  ' },
  { ...preview, context: { ...context, role: 'secretary' } },
  { ...preview, context: { ...context, periodLabel: '2026.1' } },
  { ...preview, context: { ...context, courseLabel: 'ENF' } },
  { operation: 'candidates', context, page: 0 },
  { ...confirm, confirmed: false },
  { ...confirm, previewVersion: 'falso' },
  { ...confirm, requestKey: 'falso' },
])
  assert.throws(() => readCompletionInput(value));
console.log(
  'OK: conclusão exige contexto, seleção única/limitada, motivo, versão e confirmação; campos forjados recusados.',
);
