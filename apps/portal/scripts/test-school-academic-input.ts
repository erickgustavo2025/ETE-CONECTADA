import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readClassCatalogueInput } from '../src/lib/school-class-catalogue';
import { readAcademicAdminInput } from '../src/lib/school-academic-input';
const id = randomUUID(),
  requestKey = randomUUID();
assert.deepEqual(
  readAcademicAdminInput({ operation: 'detail', enrollmentId: id }),
  { operation: 'detail', enrollmentId: id, page: 1 },
);
const change = {
  operation: 'change',
  enrollmentId: id,
  action: 'REPEAT',
  version: 'a'.repeat(64),
  requestKey,
  confirmed: true,
  reason: ' Reprovação\nconferida pela secretaria. ',
};
assert.equal(readAcademicAdminInput(change).operation, 'change');
for (const bad of [
  null,
  {},
  { ...change, role: 'secretary' },
  { ...change, confirmed: false },
  { ...change, reason: '' },
  { ...change, action: 'DELETE' },
  { ...change, nextClassName: 'OUTRA TURMA' },
  { ...change, version: 'falso' },
  { ...change, enrollmentId: 'outro' },
  { ...change, reason: 'x'.repeat(501) },
  { ...change, reason: 'motivo\u0000indevido' },
  { operation: 'detail', enrollmentId: id, page: 10001 },
])
  assert.throws(() => readAcademicAdminInput(bad));
console.log(
  'OK: contrato acadêmico estrito, confirmação/motivo, versão/chave, limites e recusa de identidade/papel do cliente.',
);

assert.deepEqual(
  readClassCatalogueInput({ operation: 'classes', mode: 'INTEGRADO' }),
  { mode: 'INTEGRADO', page: 1, afterStudentId: null },
);
for (const bad of [
  null,
  {},
  { operation: 'classes', mode: 'OUTRO' },
  { operation: 'classes', mode: 'INTEGRADO', page: 0 },
  { operation: 'classes', mode: 'INTEGRADO', role: 'secretary' },
  { operation: 'classes', mode: 'SUBSEQUENTE', page: 10001 },
])
  assert.throws(() => readClassCatalogueInput(bad));
