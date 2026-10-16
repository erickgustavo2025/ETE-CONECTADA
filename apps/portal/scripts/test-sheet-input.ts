import assert from 'node:assert/strict';
import { reportTestFailure } from './test-environment';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  inspectIntegratedSheet,
  parseSheetInput,
  decodeXls,
  SHEET_FILE_LIMIT,
} from '../src/lib/sheet-import-input';
export function sheetFixture(mode: 'INTEGRADO' | 'SUBSEQUENTE' = 'INTEGRADO') {
  const rows = [
    ['Alunos das Turmas'],
    ['Escola fictícia'],
    [
      mode === 'INTEGRADO'
        ? 'Ensino Médio - Técnico em Administração'
        : 'Técnico em Enfermagem - Subsequente',
    ],
    [
      mode === 'INTEGRADO'
        ? '1ANO - TURMA-FICTICIA'
        : '1MODULO - TURMA-FICTICIA',
    ],
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
    [
      '00001001',
      'Pessoa Fictícia Um',
      '29/02/2008',
      '',
      'IGNORAR',
      '',
      '',
      '',
      'Filiação Fictícia Um, Filiação Fictícia Dois',
    ],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Fictícia');
  const context = {
    sheetName: 'Fictícia',
    scopeId: randomUUID(),
    periodLabel: '2026',
    className: 'Turma fictícia',
    courseLabel: mode === 'INTEGRADO' ? 'ADM' : 'ENF',
    stage: 1,
    confirmed: true,
  };
  return {
    wb,
    context,
    file: () => XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }) as Buffer,
  };
}
async function main() {
  const f = sheetFixture();
  const inspection = await inspectIntegratedSheet(f.file());
  assert.deepEqual(inspection, [
    { sheetName: 'Fictícia', courseLabel: 'ADM', stage: 1, rows: 1 },
  ]);
  await assert.rejects(
    inspectIntegratedSheet(sheetFixture('SUBSEQUENTE').file()),
    /Modalidade/,
  );
  const ambiguous = sheetFixture();
  ambiguous.wb.Sheets['Fictícia'].A3 = {
    t: 's',
    v: 'Ensino Médio - Administração e Desenvolvimento de Sistemas',
  };
  await assert.rejects(inspectIntegratedSheet(ambiguous.file()), /Curso/);
  const input = await parseSheetInput(f.file(), 'INTEGRADO', [f.context]);
  assert.equal(input.rows[0].schoolRegistration, '00001001');
  assert.equal(input.rows[0].parentTwo, 'Filiação Fictícia Dois');
  assert.equal('sex' in input.rows[0], false);
  await assert.rejects(
    parseSheetInput(f.file(), 'SUBSEQUENTE', [f.context]),
    /Modalidade/,
  );
  await assert.rejects(
    parseSheetInput(f.file(), 'INTEGRADO', [
      { ...f.context, confirmed: false },
    ]),
  );
  await assert.rejects(decodeXls(Buffer.from('arquivo.xls')));
  await assert.rejects(decodeXls(Buffer.alloc(SHEET_FILE_LIMIT + 1)));
  f.wb.Sheets['Fictícia'].C7 = { t: 's', v: '31/02/2008' };
  await assert.rejects(
    parseSheetInput(f.file(), 'INTEGRADO', [f.context]),
    /linha 7/,
  );
  f.wb.Sheets['Fictícia'].C7 = { t: 's', v: '29/02/2008' };
  f.wb.Sheets['Fictícia'].B7 = {
    t: 's',
    v: 'Pessoa Fictícia Um',
    l: { Target: 'https://example.invalid' },
  };
  await assert.rejects(
    parseSheetInput(f.file(), 'INTEGRADO', [f.context]),
    /Arquivo/,
  );
  // Fórmula BIFF real: o escritor simples de XLS não serializa o campo .f.
  const formulaFixture = sheetFixture();
  const cfb = XLSX.CFB.read(formulaFixture.file(), { type: 'buffer' });
  const entry = XLSX.CFB.find(cfb, 'Workbook');
  const workbook = Buffer.from(entry.content);
  let offset = 0,
    eof = -1;
  while (offset + 4 <= workbook.length) {
    const type = workbook.readUInt16LE(offset),
      size = workbook.readUInt16LE(offset + 2);
    if (type === 10) eof = offset;
    offset += 4 + size;
  }
  assert.ok(eof >= 0);
  const record = Buffer.alloc(29);
  record.writeUInt16LE(6, 0);
  record.writeUInt16LE(25, 2);
  record.writeUInt16LE(6, 4);
  record.writeUInt16LE(3, 6);
  record.writeDoubleLE(1, 10);
  record.writeUInt16LE(3, 24);
  record[26] = 0x1e;
  record.writeUInt16LE(1, 27);
  XLSX.CFB.utils.cfb_add(
    cfb,
    'Workbook',
    Buffer.concat([workbook.subarray(0, eof), record, workbook.subarray(eof)]),
  );
  const formulaFile = Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer' }));
  assert.ok(
    XLSX.read(formulaFile, { type: 'buffer', cellFormula: true }).Sheets[
      'Fictícia'
    ].D7.f,
    'A fixture deve conter fórmula real.',
  );
  await assert.rejects(decodeXls(formulaFile), /Arquivo/);
  // Dimensões falsas não podem esconder uma célula além do limite.
  const farRecord = Buffer.alloc(18);
  farRecord.writeUInt16LE(0x0203, 0);
  farRecord.writeUInt16LE(14, 2);
  farRecord.writeUInt16LE(6000, 4);
  farRecord.writeUInt16LE(3, 6);
  farRecord.writeDoubleLE(1, 10);
  XLSX.CFB.utils.cfb_add(
    cfb,
    'Workbook',
    Buffer.concat([
      workbook.subarray(0, eof),
      farRecord,
      workbook.subarray(eof),
    ]),
  );
  await assert.rejects(
    decodeXls(Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer' }))),
    /Arquivo/,
  );
  const corrupt = Buffer.alloc(512);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(corrupt);
  await assert.rejects(decodeXls(corrupt), /Arquivo/);
  const missing = sheetFixture();
  missing.wb.Sheets['Fictícia'].I7 = { t: 's', v: '' };
  assert.equal(
    (await parseSheetInput(missing.file(), 'INTEGRADO', [missing.context]))
      .rows[0].parentOne,
    undefined,
  );
  const duplicate = sheetFixture();
  XLSX.utils.sheet_add_aoa(
    duplicate.wb.Sheets['Fictícia'],
    [['00001001', 'Outro fictício', '01/01/2000']],
    { origin: 'A8' },
  );
  await assert.rejects(
    parseSheetInput(duplicate.file(), 'INTEGRADO', [duplicate.context]),
    /linha 8/,
  );
  await assert.rejects(
    parseSheetInput(missing.file(), 'INTEGRADO', [
      { ...missing.context, stage: 2 },
    ]),
    /divergente/,
  );
  const sub = sheetFixture('SUBSEQUENTE');
  assert.equal(
    (await parseSheetInput(sub.file(), 'SUBSEQUENTE', [sub.context])).rows
      .length,
    1,
  );
  console.log(
    'OK: XLS binário sintético, posições vazias, filiação, zeros, modalidade, confirmação, limites, data inválida e link externo.',
  );
}
if (process.argv[1]?.endsWith('test-sheet-input.ts'))
  main().catch(reportTestFailure);
