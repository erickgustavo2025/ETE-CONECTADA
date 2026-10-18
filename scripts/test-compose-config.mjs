import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const check = fileURLToPath(
  new URL('./check-compose-lab.mjs', import.meta.url),
);
const run = (input) =>
  spawnSync(process.execPath, [check], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10_000,
  });
assert.equal(run(config).status, 0);
for (const mutate of [
  (c) => {
    c.services.portal.ports[0].host_ip = '0.0.0.0';
  },
  (c) => {
    c.services.db.ports = [{ target: 5432, published: '5432' }];
  },
  (c) => {
    c.services.site.networks.database = null;
  },
  (c) => {
    c.services.portal.privileged = true;
  },
  (c) => {
    c.services.db.volumes[0].type = 'bind';
  },
  (c) => {
    c.services.site.secrets = [{ source: 'database_password' }];
  },
  (c) => {
    c.services.portal.environment.DATABASE_URL =
      'postgresql://fixture@db/ete_lab';
  },
  (c) => {
    c.services.db.user = '0';
  },
  (c) => {
    c.networks.database.internal = false;
  },
  (c) => {
    c.volumes.postgres_data.external = true;
  },
  (c) => {
    c.services.portal.cap_add = ['SYS_ADMIN'];
  },
  (c) => {
    c.secrets.portal_database_url.file =
      c.services.site.build.context + '/src/private.json';
  },
]) {
  const changed = structuredClone(config);
  mutate(changed);
  const result = run(changed);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, 'Alteração insegura precisa reprovar.');
  assert.equal(result.stdout, '');
}
console.log(
  'OK: configuração positiva aprovada e doze alterações inseguras recusadas.',
);
