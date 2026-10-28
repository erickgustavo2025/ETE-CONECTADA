import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  declarationRegistryPreviewEnabled,
  prepareDeclarationDocuments,
  documentInsertData,
} from '../src/lib/declaration-documents';
import { subsequentFixture } from './subsequent-declaration-fixture';
import { validateDeclarationFields } from '../src/lib/declarations';

const fixture = subsequentFixture();
const fields = validateDeclarationFields({
  enrollmentId: fixture.enrollment.id,
  naturality: 'Recife/PE',
  parentOne: 'Filiação fictícia',
  courseName: 'Desenvolvimento de Sistemas',
  schoolPeriod: fixture.enrollment.periodLabel,
  reviewed: true,
});
const item = { student: { ...fixture.student, cpf: '00000000000' }, fields };
test('registro experimental é fechado por padrão e sempre fechado em production', () => {
  for (const NODE_ENV of [undefined, 'development', 'test', 'production']) {
    assert.equal(declarationRegistryPreviewEnabled({ NODE_ENV }), false);
    assert.equal(
      declarationRegistryPreviewEnabled({
        NODE_ENV,
        DECLARATION_REGISTRY_PREVIEW: 'false',
      }),
      false,
    );
    assert.equal(
      declarationRegistryPreviewEnabled({
        NODE_ENV,
        DECLARATION_REGISTRY_PREVIEW: 'true',
      }),
      NODE_ENV === 'development' || NODE_ENV === 'test',
    );
  }
});
test('reserva códigos aleatórios independentes do aluno e snapshot mínimo privado', () => {
  const records = prepareDeclarationDocuments([item]);
  const other = prepareDeclarationDocuments([item]);
  assert.notEqual(records[0].id, other[0].id);
  assert.notEqual(records[0].publicCode, other[0].publicCode);
  assert.match(records[0].publicCode, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(records[0].studentId, item.student.id);
  assert.equal(records[0].enrollmentId, fixture.enrollment.id);
  assert.equal(records[0].sourcePdfPage, 1);
  const snapshot = JSON.stringify(records[0].snapshot);
  assert.ok(snapshot.includes('FILIAÇÃO FICTÍCIA'));
  assert.ok(!snapshot.includes('00000000000'));
  assert.ok(!snapshot.includes('offering'));
  assert.equal(records[0].snapshotVersion, 1);
});
test('hash corresponde aos bytes completos e posição do item no lote é preservada', () => {
  const bytes = Buffer.from('%PDF-conteudo-ficticio');
  const records = prepareDeclarationDocuments([item, item]);
  const data = documentInsertData(
    records,
    bytes,
    '00000000-0000-4000-8000-000000000001',
  );
  assert.deepEqual(
    data.map((row) => row.sourcePdfPage),
    [1, 2],
  );
  assert.ok(
    data.every(
      (row) =>
        row.sourcePdfSha256 ===
        createHash('sha256').update(bytes).digest('hex'),
    ),
  );
  assert.ok(data.every((row) => row.status === 'DRAFT'));
  assert.ok(
    data.every(
      (row) => row.createdById === '00000000-0000-4000-8000-000000000001',
    ),
  );
  assert.notEqual(
    documentInsertData(
      records,
      Buffer.from('%PDF-alterado'),
      data[0].createdById,
    )[0].sourcePdfSha256,
    data[0].sourcePdfSha256,
  );
});
test('reserva recusa lote vazio, excesso e vínculo que não pertence ao aluno selecionado', () => {
  assert.throws(() => prepareDeclarationDocuments([]));
  assert.throws(() => prepareDeclarationDocuments(Array(101).fill(item)));
  assert.throws(() =>
    prepareDeclarationDocuments([
      {
        ...item,
        fields: {
          ...fields,
          enrollmentId: '00000000-0000-4000-8000-000000000002',
        },
      },
    ]),
  );
});
