import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.argv[2];
assert.ok(['site', 'portal'].includes(app), 'Informe site ou portal.');
const root = fileURLToPath(new URL('../', import.meta.url));
const project = path.join(root, 'apps', app);
const standalone = path.join(project, '.next/standalone');
for (const relative of [
  `apps/${app}/server.js`,
  `apps/${app}/.next/BUILD_ID`,
  `apps/${app}/.next/server/app-paths-manifest.json`,
  'node_modules/next/package.json',
])
  await access(path.join(standalone, relative));
// São arquivos lidos em runtime; compilar TypeScript não demonstra sua presença.
if (app === 'portal') {
  for (const relative of [
    'src/assets/fonts/DejaVuSans.ttf',
    'src/assets/fonts/DejaVuSans-Bold.ttf',
    'public/images/governo.png',
  ])
    await access(path.join(standalone, 'apps/portal', relative));
  const xlsx = JSON.parse(
    await readFile(
      path.join(standalone, 'node_modules/xlsx/package.json'),
      'utf8',
    ),
  );
  assert.equal(xlsx.version, '0.20.3');
}
console.log(
  `OK: standalone de ${app} com servidor, dependências e arquivos necessários.`,
);
