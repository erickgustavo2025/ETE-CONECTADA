import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { verifyTestDatabase, reportTestFailure } from './test-environment';

async function main() {
  if (process.argv.length > 2) throw new Error('Use db:demo sem argumentos.');
  // Confere banco loopback e marcador ANTES de qualquer migração ou seed.
  await verifyTestDatabase();
  const require = createRequire(import.meta.url);
  for (const args of [
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    ['--import', 'tsx', 'scripts/seed.ts', '--demo'],
  ]) {
    const child = spawnSync(process.execPath, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        DIRECT_URL: process.env.TEST_DATABASE_URL,
      },
    });
    if (child.error) throw child.error;
    if (child.status !== 0)
      throw new Error('Não foi possível preparar a demonstração identificada.');
  }
}
main().catch(reportTestFailure);
