import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  const config = JSON.parse(readFileSync(0, 'utf8'));
  assert.deepEqual(Object.keys(config.services).sort(), [
    'db',
    'portal',
    'proxy',
    'site',
  ]);
  const proxy = config.services.proxy;
  for (const name of ['site', 'portal', 'db'])
    assert.ok(!config.services[name].ports?.length);
  assert.equal(proxy.user, '1000:1000');
  assert.equal(proxy.read_only, true);
  assert.deepEqual(proxy.cap_drop, ['ALL']);
  assert.deepEqual(proxy.security_opt, ['no-new-privileges:true']);
  assert.ok(
    !proxy.privileged &&
      !proxy.network_mode &&
      !proxy.cap_add?.length &&
      !proxy.devices?.length,
  );
  assert.ok(
    !proxy.pid &&
      !proxy.ipc &&
      !proxy.uts &&
      !proxy.volumes_from &&
      !proxy.command &&
      !proxy.entrypoint,
  );
  assert.deepEqual(Object.keys(proxy.networks), ['web']);
  assert.equal(Number(proxy.mem_limit), 268435456);
  assert.equal(Number(proxy.cpus), 0.5);
  assert.equal(proxy.pids_limit, 128);
  assert.equal(proxy.restart, 'unless-stopped');
  assert.match(proxy.image, /^ete-(?:lab-)?proxy:[A-Za-z0-9-]+$/);
  assert.equal(
    path.relative(config.services.site.build.context, proxy.build.context),
    'infra/caddy',
  );
  assert.deepEqual(proxy.build.labels, proxy.labels);
  assert.equal(proxy.ports.length, 2);
  assert.deepEqual(proxy.ports.map((p) => p.target).sort(), [8080, 8443]);
  for (const port of proxy.ports) {
    assert.equal(port.host_ip, '127.0.0.1');
    assert.equal(port.protocol, 'tcp');
  }
  const port = proxy.environment.ETE_LAB_HTTPS_PORT;
  assert.match(port, /^\d{4,5}$/);
  assert.ok(Number(port) >= 1024 && Number(port) <= 65535);
  assert.equal(
    String(proxy.ports.find((p) => p.target === 8443).published),
    port,
  );
  for (const name of ['site', 'portal'])
    assert.equal(
      config.services[name].environment[`${name.toUpperCase()}_PUBLIC_URL`],
      `https://${name}.example.invalid:${port}`,
    );
  assert.deepEqual(proxy.secrets.map((s) => s.source).sort(), [
    'proxy_certificate',
    'proxy_key',
  ]);
  assert.equal(proxy.volumes.length, 1);
  assert.equal(proxy.volumes[0].type, 'bind');
  assert.equal(proxy.volumes[0].target, '/etc/caddy/Caddyfile');
  assert.equal(proxy.volumes[0].read_only, true);
  for (const file of [
    proxy.volumes[0].source,
    config.secrets.proxy_certificate.file,
    config.secrets.proxy_key.file,
  ]) {
    assert.ok(path.isAbsolute(file));
    assert.ok(
      path
        .relative(config.services.site.build.context, file)
        .startsWith('..' + path.sep),
    );
  }
  assert.equal(proxy.depends_on.site.condition, 'service_healthy');
  assert.equal(proxy.depends_on.portal.condition, 'service_healthy');
  // Reutiliza as garantias já exercitadas no laboratório base.
  delete config.services.proxy;
  delete config.secrets.proxy_certificate;
  delete config.secrets.proxy_key;
  for (const name of ['site', 'portal'])
    config.services[name].ports = [{ host_ip: '127.0.0.1', target: 3000 }];
  const checked = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./check-compose-lab.mjs', import.meta.url))],
    {
      input: JSON.stringify(config),
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(checked.status, 0);
  console.log(
    'OK: apenas proxy publica portas locais; apps, banco, chaves e recursos isolados.',
  );
} catch {
  console.error(
    'Configuração HTTPS recusada: confira portas, redes, origens, segredos e limites.',
  );
  process.exit(1);
}
