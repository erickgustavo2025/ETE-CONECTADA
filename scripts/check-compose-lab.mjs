import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

try {
  const config = JSON.parse(readFileSync(0, 'utf8'));
  assert.deepEqual(Object.keys(config.services).sort(), [
    'db',
    'portal',
    'site',
  ]);
  assert.deepEqual(Object.keys(config.networks).sort(), ['database', 'web']);
  assert.deepEqual(Object.keys(config.volumes), ['postgres_data']);
  assert.equal(config.networks.database.internal, true);
  for (const network of Object.values(config.networks))
    assert.ok(!network.external);
  assert.ok(!config.volumes.postgres_data.external);
  assert.deepEqual(Object.keys(config.secrets).sort(), [
    'database_password',
    'portal_database_url',
  ]);
  for (const secret of Object.values(config.secrets)) {
    assert.ok(secret.file.startsWith('/'));
    assert.ok(!secret.environment && !secret.external);
    const relative = path.relative(
      config.services.site.build.context,
      secret.file,
    );
    assert.ok(
      relative.startsWith('..' + path.sep),
      'Segredos precisam ficar fora do contexto de build.',
    );
  }
  const networks = {
    site: ['web'],
    portal: ['database', 'web'],
    db: ['database'],
  };
  for (const [name, service] of Object.entries(config.services)) {
    assert.equal(service.user, name === 'db' ? '70:70' : '1000:1000');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.ok(service.security_opt.includes('no-new-privileges:true'));
    assert.ok(!service.privileged && !service.network_mode && !service.pid);
    assert.ok(
      !service.cap_add?.length &&
        !service.devices?.length &&
        !service.volumes_from?.length &&
        !service.ipc &&
        !service.uts,
    );
    assert.equal(service.restart, 'unless-stopped');
    assert.equal(Number(service.cpus), 1);
    assert.equal(service.pids_limit, 128);
    assert.equal(
      Number(service.mem_limit),
      name === 'db' ? 536870912 : 805306368,
    );
    assert.deepEqual(Object.keys(service.networks).sort(), networks[name]);
    assert.ok(
      !service.environment.DATABASE_URL &&
        !service.environment.POSTGRES_PASSWORD,
    );
    assert.ok(
      !service.command && !service.entrypoint && !service.container_name,
    );
    if (name === 'db') {
      assert.ok(!service.ports?.length);
      assert.match(
        service.image,
        /^postgres:16\.15-alpine3\.24@sha256:[a-f0-9]{64}$/,
      );
      assert.equal(
        service.environment.POSTGRES_PASSWORD_FILE,
        '/run/secrets/database_password',
      );
      assert.deepEqual(
        service.secrets.map((s) => s.source),
        ['database_password'],
      );
      assert.equal(service.volumes.length, 1);
      assert.equal(service.volumes[0].type, 'volume');
      assert.equal(service.volumes[0].source, 'postgres_data');
      assert.equal(service.volumes[0].target, '/var/lib/postgresql/data');
    } else {
      assert.ok(!service.volumes?.length);
      assert.equal(service.ports.length, 1);
      assert.equal(service.ports[0].host_ip, '127.0.0.1');
      assert.equal(service.ports[0].target, 3000);
      if (name === 'site') assert.ok(!service.secrets?.length);
      else {
        assert.equal(
          service.environment.DATABASE_URL_FILE,
          '/run/secrets/portal_database_url',
        );
        assert.deepEqual(
          service.secrets.map((s) => s.source),
          ['portal_database_url'],
        );
        assert.equal(service.depends_on.db.condition, 'service_healthy');
      }
    }
  }
  console.log(
    'OK: Compose de laboratório separa redes, segredos, persistência e recursos.',
  );
} catch {
  console.error(
    'Configuração de laboratório recusada: confira isolamento, segredos, persistência e limites.',
  );
  process.exit(1);
}
