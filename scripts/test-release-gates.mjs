import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { selectRun, verifyJobs, releaseRequested } from './release-gates.mjs';

for (const [event, ref, requested] of [
  ['workflow_dispatch', 'main', true],
  ['push', 'feature/ec-086-artefato-verificado', true],
  ['push', 'main', false],
  ['push', 'feature/ec-082-proxy', false],
  ['pull_request', 'feature/ec-086-artefato-verificado', false],
  ['workflow_dispatch', '', false],
])
  assert.equal(releaseRequested(event, ref), requested);

const temporary = await mkdtemp(path.join(tmpdir(), 'ete-release-request-'));
try {
  const output = path.join(temporary, 'output');
  const environment = path.join(temporary, 'environment');
  const script = fileURLToPath(new URL('./release-gates.mjs', import.meta.url));
  for (const [ref, id, status, requested] of [
    ['feature/ec-086-fixture', '123', 0, true],
    ['main', '123', 0, false],
    ['feature/ec-086-fixture', '123\nUNEXPECTED=true', 1, false],
  ]) {
    await writeFile(output, '');
    await writeFile(environment, '');
    const result = spawnSync(process.execPath, [script, 'request'], {
      env: {
        PATH: process.env.PATH,
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF_NAME: ref,
        GITHUB_RUN_ID: id,
        GITHUB_RUN_ATTEMPT: '1',
        RUNNER_TEMP: temporary,
        GITHUB_OUTPUT: output,
        GITHUB_ENV: environment,
      },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, status);
    assert.equal(
      await readFile(output, 'utf8'),
      status ? '' : `package=${requested}\n`,
    );
    assert.equal(
      await readFile(environment, 'utf8'),
      status
        ? ''
        : `TEST_IMAGE_OUTPUT_DIR=${requested ? path.join(temporary, 'ete-release-123-1') : ''}\n`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const expected = {
  repository: 'erickgustavo2025/ETE-CONECTADA',
  sha: 'a'.repeat(40),
  branch: 'feature/fixture',
};
const run = {
  id: 2,
  head_sha: expected.sha,
  head_branch: expected.branch,
  head_repository: { full_name: expected.repository },
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};
assert.equal(selectRun([run], expected).id, 2);
assert.equal(selectRun([], expected), null);
for (const changed of [
  { head_sha: 'b'.repeat(40) },
  { head_branch: 'main' },
  { head_repository: { full_name: 'foreign/repository' } },
  { event: 'pull_request' },
])
  assert.equal(selectRun([{ ...run, ...changed }], expected), null);
assert.equal(
  selectRun([{ ...run, status: 'in_progress', conclusion: null }], expected),
  null,
);
for (const conclusion of [
  'failure',
  'cancelled',
  'skipped',
  'neutral',
  'timed_out',
]) {
  assert.throws(() => selectRun([{ ...run, conclusion }], expected));
  assert.throws(
    () =>
      selectRun(
        [
          { ...run, id: 1 },
          { ...run, conclusion },
        ],
        expected,
      ),
    'Não aceitar sucesso antigo quando a execução nova falha.',
  );
}
const job = { name: 'Obrigatório', status: 'completed', conclusion: 'success' };
assert.equal(verifyJobs([job], ['Obrigatório']), true);
assert.equal(verifyJobs([], ['Obrigatório']), false);
assert.equal(
  verifyJobs([{ ...job, status: 'in_progress' }], ['Obrigatório']),
  false,
);
for (const conclusion of ['failure', 'skipped', 'cancelled'])
  assert.throws(() => verifyJobs([{ ...job, conclusion }], ['Obrigatório']));
console.log(
  'OK: release exige SHA/repositório/branch/evento corretos, execução mais recente e jobs obrigatórios aprovados.',
);
