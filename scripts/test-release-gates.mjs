import assert from 'node:assert/strict';
import { selectRun, verifyJobs } from './release-gates.mjs';

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
