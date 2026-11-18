import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:net';
import { promisify } from 'node:util';
import { openTestEnvironment, reportTestFailure } from './test-environment';

const exec = promisify(execFile);
const privateContent = 'conteudo-ficticio-que-nao-aparece-em-logs';

async function listen(server: Server, scheme: string) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `${scheme}://127.0.0.1:${address.port}`;
}

type Check = {
  event: string;
  entryPoint: string;
  runId: string;
  at: string;
  check: string;
  state: string;
  result: string;
};

async function inspect(env: Record<string, string>, expectedExit: number) {
  let stdout: string;
  try {
    const result = await exec(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-operational-health.ts'],
      { env: { NODE_ENV: 'test', ...env }, timeout: 15_000 },
    );
    assert.equal(expectedExit, 0);
    stdout = result.stdout;
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    assert.equal(failed.code, expectedExit, 'Código de saída do monitor.');
    assert.equal(failed.stderr, '');
    stdout = failed.stdout ?? '';
  }
  assert.doesNotMatch(
    stdout,
    /postgres|https?:\/\/|example\.invalid|PRIVATE_FIXTURE|conteudo-ficticio/u,
  );
  const lines: Check[] = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 7);
  assert.equal(new Set(lines.map((line) => line.runId)).size, 1);
  for (const item of lines) {
    assert.deepEqual(Object.keys(item).sort(), [
      'at',
      'check',
      'entryPoint',
      'event',
      'result',
      'runId',
      'state',
    ]);
    assert.equal(item.event, 'operational_check');
    assert.equal(item.entryPoint, 'cli');
  }
  return Object.fromEntries(lines.map((line) => [line.check, line]));
}

async function main() {
  const environment = await openTestEnvironment();
  const work = await mkdtemp(join(tmpdir(), 'ete-ops-'));
  let portalStatus = 200;
  const site = httpServer((_request, response) => response.end(privateContent));
  const portal = httpServer((request, response) => {
    response.statusCode = request.url === '/login' ? portalStatus : 404;
    response.end(privateContent);
  });
  let secure: Server | undefined;
  try {
    const receipt = join(work, 'backup.json');
    await writeFile(
      receipt,
      JSON.stringify({ verifiedAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
    const config = {
      OPS_SITE_ORIGIN: await listen(site, 'http'),
      OPS_PORTAL_ORIGIN: await listen(portal, 'http'),
      OPS_DB_URL: process.env.DATABASE_URL!,
      OPS_FILESYSTEM: work,
      OPS_DISK_MIN_FREE_PERCENT: '1',
      OPS_BACKUP_RECEIPT: receipt,
      OPS_BACKUP_MAX_AGE_HOURS: '1',
      OPS_TLS_MIN_DAYS: '1',
    };
    const healthy = await inspect(config, 0);
    for (const check of ['site', 'portal', 'banco', 'disco', 'backup'])
      assert.equal(healthy[check].result, 'ok');
    assert.equal(healthy.certificado_site.result, 'local_http');

    const certificate = join(work, 'server.pem');
    const key = join(work, 'key.pem');
    await exec('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-noenc',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      key,
      '-out',
      certificate,
    ]);
    secure = httpsServer(
      {
        cert: await readFile(certificate),
        key: await readFile(key),
        minVersion: 'TLSv1.2',
      },
      (_request, response) => response.end(privateContent),
    );
    const httpsOrigin = await listen(secure, 'https');

    portalStatus = 503;
    await writeFile(
      receipt,
      JSON.stringify({ verifiedAt: '2020-01-01T00:00:00.000Z' }),
    );
    const alerts = await inspect(
      {
        ...config,
        OPS_SITE_ORIGIN: httpsOrigin,
        OPS_DB_URL: process.env.TEST_DATABASE_URL!,
        OPS_DISK_MIN_FREE_PERCENT: '100',
        OPS_TLS_MIN_DAYS: '2',
        NODE_EXTRA_CA_CERTS: certificate,
      },
      1,
    );
    assert.equal(alerts.site.result, 'ok');
    assert.equal(alerts.portal.result, 'http_status');
    assert.equal(alerts.banco.result, 'indisponivel');
    assert.equal(alerts.disco.result, 'pouco_espaco');
    assert.equal(alerts.backup.result, 'backup_atrasado');
    assert.equal(
      alerts.certificado_site.result,
      'certificado_proximo_do_vencimento',
    );

    const invalid = await inspect(
      {
        ...config,
        OPS_SITE_ORIGIN: httpsOrigin,
        OPS_PORTAL_ORIGIN: 'https://secret:test@example.invalid',
      },
      1,
    );
    assert.equal(invalid.site.result, 'indisponivel');
    assert.equal(invalid.certificado_site.result, 'indisponivel');
    assert.equal(invalid.portal.result, 'configuracao');
    portalStatus = 200;
    await writeFile(
      receipt,
      JSON.stringify({ verifiedAt: new Date().toISOString() }),
    );
    const restored = await inspect(config, 0);
    assert.equal(restored.portal.result, 'ok');
    assert.equal(restored.banco.result, 'ok');
    assert.equal(restored.backup.result, 'ok');
    console.log(
      'OK: serviços, banco, disco, idade do backup e TLS em isolamento, com códigos de alerta e saída sem dados privados.',
    );
  } finally {
    await Promise.allSettled([
      site[Symbol.asyncDispose](),
      portal[Symbol.asyncDispose](),
      secure?.[Symbol.asyncDispose](),
    ]);
    try {
      await environment.close();
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

main().catch(reportTestFailure);
