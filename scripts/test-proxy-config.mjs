import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const check = fileURLToPath(new URL('./check-proxy-lab.mjs', import.meta.url));
const run = (input) =>
  spawnSync(process.execPath, [check], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10_000,
  });
assert.equal(
  run(config).status,
  0,
  'Configuração HTTPS positiva precisa passar.',
);
for (const mutate of [
  (c) => {
    c.services.portal.ports = [{ target: 3000, published: '3002' }];
  },
  (c) => {
    c.services.site.ports = [{ target: 3000, published: '3000' }];
  },
  (c) => {
    c.services.proxy.ports[0].host_ip = '0.0.0.0';
  },
  (c) => {
    c.services.proxy.networks.database = null;
  },
  (c) => {
    c.services.proxy.ports.push({ target: 2019, published: '2019' });
  },
  (c) => {
    c.services.proxy.user = '0';
  },
  (c) => {
    c.services.proxy.read_only = false;
  },
  (c) => {
    c.services.proxy.volumes.push({
      type: 'bind',
      source: '/var/run/docker.sock',
      target: '/var/run/docker.sock',
    });
  },
  (c) => {
    c.services.proxy.image = 'caddy:latest';
  },
  (c) => {
    c.services.proxy.secrets.push({ source: 'database_password' });
  },
  (c) => {
    c.secrets.proxy_key.file = c.services.site.build.context + '/key.pem';
  },
  (c) => {
    c.services.portal.environment.PORTAL_PUBLIC_URL =
      'http://portal.example.invalid';
  },
]) {
  const changed = structuredClone(config);
  mutate(changed);
  const result = run(changed);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, 'Configuração insegura precisa reprovar.');
  assert.equal(result.stdout, '');
}
console.log('OK: proxy positivo e doze alterações inseguras conferidos.');
