import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDocumentAction } from '../src/lib/declaration-document-actions';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const valid = {
  documentId: id,
  action: 'CANCELLED',
  reason: 'Erro de preenchimento',
  confirmed: true,
};
test('ação normaliza UUID e espaços, sem aceitar responsável vindo do cliente', () => {
  assert.deepEqual(
    readDocumentAction({
      ...valid,
      documentId: id.toUpperCase(),
      reason: '  Erro   de preenchimento  ',
      createdById: other,
    }),
    {
      documentId: id,
      action: 'CANCELLED',
      reason: 'Erro de preenchimento',
      successorId: null,
    },
  );
});
test('cancelamento e substituição exigem confirmação, motivo e sucessor coerentes', () => {
  for (const body of [
    null,
    [],
    {},
    { ...valid, documentId: 'inválido' },
    { ...valid, confirmed: 1 },
    { ...valid, confirmed: false },
    { ...valid, action: 'ISSUED' },
    { ...valid, action: {} },
    { ...valid, reason: '  ' },
    { ...valid, reason: 'a'.repeat(501) },
    { ...valid, reason: 'err\u0000o' },
    { ...valid, successorId: other },
    { ...valid, action: 'SUPERSEDED' },
    { ...valid, action: 'SUPERSEDED', successorId: id.toUpperCase() },
  ])
    assert.throws(() => readDocumentAction(body));
  assert.equal(
    readDocumentAction({ ...valid, action: 'SUPERSEDED', successorId: other })
      .successorId,
    other,
  );
});
