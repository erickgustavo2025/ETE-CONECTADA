import { execFileSync } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const write = args.includes('--write');
const all = args.includes('--all');
const scopeArg = args.find((arg) => arg.startsWith('--scope='));
if (
  args.some(
    (arg) => !['--write', '--check', '--all'].includes(arg) && arg !== scopeArg,
  )
) {
  throw new Error('Use --check ou --write, com --all e --scope opcionais.');
}
const scope = scopeArg?.slice('--scope='.length);
if (scope && !['apps/site', 'apps/portal'].includes(scope))
  throw new Error('Escopo de aplicação inválido.');
if (args.includes('--check') && write)
  throw new Error('Escolha --check ou --write.');
const git = (...values) =>
  execFileSync('git', values, { cwd: root, encoding: 'utf8' });
const paths = (output) => output.split('\0').filter(Boolean);
const candidates = new Set();
if (all) {
  paths(git('ls-files', '-z')).forEach((file) => candidates.add(file));
} else {
  const requestedBase = process.env.FORMAT_BASE;
  const base =
    requestedBase && !/^0+$/.test(requestedBase)
      ? requestedBase
      : 'origin/main';
  // Base explícita: não aprovar silenciosamente se o histórico estiver ausente.
  git('rev-parse', '--verify', '--end-of-options', `${base}^{commit}`);
  for (const flags of [[base], [], ['--cached']]) {
    paths(
      git('diff', '--name-only', '--diff-filter=ACMR', '-z', ...flags, '--'),
    ).forEach((file) => candidates.add(file));
  }
  paths(git('ls-files', '--others', '--exclude-standard', '-z')).forEach(
    (file) => candidates.add(file),
  );
}
let checked = 0;
let failures = 0;
for (const file of [...candidates].sort()) {
  if (scope && !file.startsWith(`${scope}/`)) continue;
  const absolute = path.join(root, file);
  let stat;
  try {
    stat = await lstat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (!stat.isFile()) continue;
  const info = await prettier.getFileInfo(absolute, {
    ignorePath: path.join(root, '.prettierignore'),
    withNodeModules: false,
  });
  if (info.ignored || !info.inferredParser) continue;
  const options = {
    ...(await prettier.resolveConfig(absolute)),
    filepath: absolute,
  };
  const original = await readFile(absolute, 'utf8');
  checked++;
  if (write) {
    const formatted = await prettier.format(original, options);
    if (formatted !== original) await writeFile(absolute, formatted);
  } else if (!(await prettier.check(original, options))) {
    failures++;
    console.error(`Formatação pendente: ${file}`);
  }
}
console.log(
  `${checked} arquivos conferidos${all ? ' (todos os rastreados)' : ' (alterados)'}.`,
);
if (failures) {
  console.error('Execute npm run format, revise o diff e repita a checagem.');
  process.exitCode = 1;
}
