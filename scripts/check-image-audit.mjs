import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateImageAudit(report, diagnostic, imageId) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(
    diagnostic,
    /Unable to get vulnerability details|no vulnerability details/i,
    'CVE sem metadados: auditoria inconclusiva.',
  );
  assert.equal(report.ArtifactType, 'container_image');
  assert.equal(report.Metadata?.ImageID, imageId);
  assert.ok(!report.Errors?.length);
  assert.ok(Array.isArray(report.Results) && report.Results.length > 0);
  const classes = new Set(report.Results.map((result) => result.Class));
  assert.ok(classes.has('os-pkgs') && classes.has('lang-pkgs'));
  for (const result of report.Results) {
    const vulnerabilities = result.Vulnerabilities ?? [];
    assert.ok(Array.isArray(vulnerabilities));
    for (const finding of vulnerabilities)
      assert.ok(['LOW', 'MEDIUM'].includes(finding.Severity));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [report, diagnostic, imageId, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0);
    validateImageAudit(
      JSON.parse(await readFile(report, 'utf8')),
      await readFile(diagnostic, 'utf8'),
      imageId,
    );
    console.log('OK: auditoria completa e vinculada à imagem testada.');
  } catch {
    console.error(
      'Auditoria de imagem incompleta ou reprovada; revisar o diagnóstico local.',
    );
    process.exitCode = 1;
  }
}
