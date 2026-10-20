import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseRequested(event, ref) {
  return (
    typeof ref === 'string' && ref.length > 0 && event === 'workflow_dispatch'
  );
}

async function configureRequest() {
  const requested = releaseRequested(
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_REF_NAME,
  );
  let directory = '';
  if (requested) {
    const temporary = process.env.RUNNER_TEMP;
    if (
      !path.isAbsolute(temporary || '') ||
      /[\r\n\0]/.test(temporary) ||
      !/^\d+$/.test(process.env.GITHUB_RUN_ID || '') ||
      !/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT || '')
    )
      throw new Error('Destino temporário inválido.');
    directory = path.join(
      temporary,
      `ete-release-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
    );
  }
  await writeFile(
    process.env.GITHUB_ENV,
    `TEST_IMAGE_OUTPUT_DIR=${directory}\n`,
    { flag: 'a' },
  );
  await writeFile(process.env.GITHUB_OUTPUT, `package=${requested}\n`, {
    flag: 'a',
  });
  console.log(
    requested
      ? 'Pacote solicitado; verificações obrigatórias continuam exigidas.'
      : 'Somente testes: esta execução não guarda pacote de imagens.',
  );
}

export function selectRun(runs, expected) {
  const run = runs
    .filter(
      (r) =>
        r.head_sha === expected.sha &&
        r.head_branch === expected.branch &&
        r.head_repository?.full_name?.toLowerCase() ===
          expected.repository.toLowerCase() &&
        (r.event === 'push' || r.event === 'workflow_dispatch'),
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed') return null;
  if (run.conclusion !== 'success')
    throw new Error('Verificação obrigatória não foi aprovada.');
  return run;
}

export function verifyJobs(jobs, names) {
  for (const name of names) {
    const job = jobs.find((j) => j.name === name);
    if (!job || job.status !== 'completed') return false;
    if (job.conclusion !== 'success')
      throw new Error('Job obrigatório não foi aprovado.');
  }
  return true;
}

async function main() {
  const expected = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    branch: process.env.GITHUB_REF_NAME,
  };
  const token = process.env.GITHUB_TOKEN;
  const output = process.env.TEST_IMAGE_OUTPUT_DIR;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(expected.repository || '') ||
    !/^[a-f0-9]{40}$/.test(expected.sha || '') ||
    !expected.branch ||
    !token ||
    !path.isAbsolute(output || '')
  )
    throw new Error('Configuração de verificação de release inválida.');
  const required = {
    'ci.yml': [
      'Validar workflows',
      'Build dos dois apps',
      'Migrações e integração em PostgreSQL descartável',
    ],
    'security.yml': ['Código, configurações e histórico de segredos'],
  };
  const request = async (suffix) => {
    const response = await fetch(
      `https://api.github.com/repos/${expected.repository}/actions/${suffix}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new Error(
        'Não foi possível conferir as verificações obrigatórias.',
      );
    return response.json();
  };
  const deadline = Date.now() + 12 * 60_000;
  let previous = '';
  while (Date.now() < deadline) {
    const verified = [];
    for (const [workflow, jobs] of Object.entries(required)) {
      const result = await request(
        `workflows/${workflow}/runs?head_sha=${expected.sha}&per_page=20`,
      );
      if (!Array.isArray(result.workflow_runs))
        throw new Error('Resposta de verificações inválida.');
      const run = selectRun(result.workflow_runs, expected);
      if (!run) continue;
      const jobResult = await request(
        `runs/${run.id}/jobs?filter=latest&per_page=100`,
      );
      if (!Array.isArray(jobResult.jobs))
        throw new Error('Resposta de jobs inválida.');
      if (verifyJobs(jobResult.jobs, jobs))
        verified.push({
          workflow,
          id: run.id,
          attempt: run.run_attempt,
          conclusion: 'success',
          jobs,
        });
    }
    const state = verified.map((r) => `${r.workflow}:${r.id}`).join(',');
    if (state !== previous) {
      console.log(`Verificações confirmadas: ${state || 'aguardando'}.`);
      previous = state;
    }
    if (verified.length === Object.keys(required).length) {
      await writeFile(
        path.join(output, 'checks.json'),
        JSON.stringify(
          {
            ...expected,
            verified_at: new Date().toISOString(),
            checks: verified,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        'OK: CI e segurança do mesmo commit e branch aprovados, incluindo jobs obrigatórios.',
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  throw new Error('Prazo encerrado sem todas as verificações obrigatórias.');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  (process.argv[2] === 'request' ? configureRequest() : main()).catch(() => {
    console.error(
      'Artefato não liberado: verificações ausentes, inválidas ou reprovadas. Confira os runs do mesmo commit.',
    );
    process.exitCode = 1;
  });
}
