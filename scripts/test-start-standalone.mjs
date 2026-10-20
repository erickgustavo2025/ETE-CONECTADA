import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const start = fileURLToPath(new URL('./start-standalone.mjs', import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), 'ete-secret-test-'));
const value = 'postgresql://fixture:synthetic@db:5432/ete_lab';
try {
  await writeFile(
    path.join(root, 'server.js'),
    `
    require('node:assert/strict').equal(process.env.DATABASE_URL || '', process.env.EXPECTED_URL);
    console.log('servidor fictício iniciado');
  `,
  );
  const file = path.join(root, 'database-url');
  const run = (env, expected = true) => {
    const result = spawnSync(process.execPath, [start], {
      cwd: root,
      env: { PATH: process.env.PATH, EXPECTED_URL: '', ...env },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    if (expected) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /servidor fictício iniciado/);
    } else {
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(
        result.stderr.trim(),
        'Não foi possível carregar a configuração externa do banco.',
      );
      assert.ok(!result.stderr.includes(value));
      assert.ok(!result.stderr.includes(file));
    }
  };
  run({});
  run({ DATABASE_URL: value, EXPECTED_URL: value });
  await writeFile(file, value + '\n');
  run({ DATABASE_URL_FILE: file, EXPECTED_URL: value });
  run({ DATABASE_URL_FILE: file, DATABASE_URL: value }, false);
  run({ DATABASE_URL_FILE: path.join(root, 'ausente') }, false);
  for (const content of [
    '',
    value + '\nsegundo',
    'x'.repeat(4097),
    'https://example.invalid',
    'postgresql://',
  ]) {
    await writeFile(file, content);
    run({ DATABASE_URL_FILE: file }, false);
  }
  console.log(
    'OK: início standalone preserva ambiente, lê segredo externo e recusa configuração inválida sem expor conteúdo.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
