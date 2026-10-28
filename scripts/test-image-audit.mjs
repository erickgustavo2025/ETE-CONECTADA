import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateImageAudit } from './check-image-audit.mjs';

const imageId = 'sha256:' + 'a'.repeat(64);
const report = () => ({
  ArtifactType: 'container_image',
  Metadata: { ImageID: imageId },
  Results: [{ Class: 'os-pkgs' }, { Class: 'lang-pkgs' }],
});

test('aceita auditoria completa da imagem correta sem alertas altos ou críticos', () => {
  assert.doesNotThrow(() => validateImageAudit(report(), '', imageId));
});

test('recusa diagnóstico de CVE sem detalhes mesmo com relatório filtrado vazio', () => {
  assert.throws(() =>
    validateImageAudit(
      report(),
      'WARN Unable to get vulnerability details (CVE may be rejected) CVE-2026-107891',
      imageId,
    ),
  );
});

test('recusa auditoria de outra imagem e relatório incompleto', () => {
  for (const invalid of [
    {},
    { ...report(), Results: [] },
    { ...report(), Results: [{ Class: 'os-pkgs' }] },
    { ...report(), Metadata: { ImageID: 'sha256:' + 'b'.repeat(64) } },
    { ...report(), Errors: ['scanner unavailable'] },
  ])
    assert.throws(() => validateImageAudit(invalid, '', imageId));
});

test('recusa vulnerabilidades altas, críticas e sem classificação', () => {
  for (const Severity of ['HIGH', 'CRITICAL', 'UNKNOWN']) {
    const result = report();
    result.Results[0].Vulnerabilities = [{ Severity }];
    assert.throws(() => validateImageAudit(result, '', imageId));
  }
});

test('entrada de linha de comando bloqueia metadados ausentes e aceita resultado completo', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'ete-audit-fixture-'));
  try {
    const file = path.join(work, 'report.json');
    const log = path.join(work, 'scan.log');
    await writeFile(file, JSON.stringify(report()));
    for (const [diagnostic, expected] of [
      ['WARN Unable to get vulnerability details', 1],
      ['', 0],
    ]) {
      await writeFile(log, diagnostic);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('./check-image-audit.mjs', import.meta.url)),
          file,
          log,
          imageId,
        ],
        { encoding: 'utf8', timeout: 5000 },
      );
      assert.equal(result.status, expected);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
