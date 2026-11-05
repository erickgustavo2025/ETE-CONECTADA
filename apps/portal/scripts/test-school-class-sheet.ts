import assert from 'node:assert/strict';
import { sheetFixture } from './test-sheet-input';
import {
  inspectSchoolSheet,
  parseSheetInput,
} from '../src/lib/sheet-import-input';
import { reportTestFailure } from './test-environment';
async function main() {
  for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
    const fixture = sheetFixture(mode),
      ws = fixture.wb.Sheets['Fictícia'];
    ws.A2 = {
      t: 's',
      v: `Escola fictícia - ${mode === 'SUBSEQUENTE' ? '2026 /2' : '2026'}`,
    };
    ws.A4 = {
      t: 's',
      v:
        mode === 'SUBSEQUENTE'
          ? '1MODULO - N - STENFN1U'
          : '1ANO - I - ADM1IN-A',
    };
    const sheets = await inspectSchoolSheet(fixture.file(), mode, true);
    const h = sheets[0];
    assert.ok(h.scopeId);
    const context = {
      ...fixture.context,
      scopeId: h.scopeId,
      className: h.classCode,
      periodLabel: h.periodLabel,
      sourceChoice: 'header',
    };
    const input = await parseSheetInput(fixture.file(), mode, [context], true);
    assert.equal(input.contexts[0].header?.schoolYear, 2026);
    assert.equal(input.contexts[0].header?.useExisting, false);
    assert.equal(
      input.contexts[0].header?.reference?.entryPeriod ?? null,
      mode === 'SUBSEQUENTE' ? '2026.2' : null,
    );
    for (const patch of [
      { periodLabel: '2027.1' },
      { className: 'OUTRA' },
      { scopeId: fixture.context.scopeId },
      { stage: 2 },
      { sourceChoice: 'bypass' },
      { header: {} },
    ])
      await assert.rejects(
        parseSheetInput(fixture.file(), mode, [{ ...context, ...patch }], true),
      );
    const originalKey = input.rows[0].key;
    fixture.wb.SheetNames[0] = 'Outra aba';
    fixture.wb.Sheets['Outra aba'] = ws;
    delete fixture.wb.Sheets['Fictícia'];
    const renamed = await inspectSchoolSheet(fixture.file(), mode, true);
    assert.equal(
      renamed[0].scopeId,
      h.scopeId,
      'Renomear aba não muda a turma.',
    );
    const again = await parseSheetInput(
      fixture.file(),
      mode,
      [{ ...context, sheetName: 'Outra aba' }],
      true,
    );
    assert.equal(again.rows[0].key, originalKey);
  }
  console.log(
    'OK: inspeção automática sem identidades, campos revalidados no servidor e chave estável ao renomear aba.',
  );
}
main().catch(reportTestFailure);
