import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, statfs } from 'node:fs/promises';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import { Client } from 'pg';
import { assertPortalDatabaseRole } from '../src/lib/database-runtime-role';
import { configuredOrigin } from '../src/lib/portal-origin';

const timeoutMs = 4_000;
const hourMs = 60 * 60 * 1_000;
type Result =
  | 'ok'
  | 'local_http'
  | 'configuracao'
  | 'indisponivel'
  | 'http_status'
  | 'pouco_espaco'
  | 'comprovante_invalido'
  | 'backup_atrasado'
  | 'certificado_proximo_do_vencimento';

class ConfigurationError extends Error {}

function requireSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError();
  return value;
}

function limit(name: string, max: number) {
  const value = requireSetting(name);
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < 1 || parsed > max)
    throw new ConfigurationError();
  return parsed;
}

function origin(name: string) {
  const value = configuredOrigin(requireSetting(name));
  if (!value) throw new ConfigurationError();
  return new URL(value);
}

async function checkHttp(name: string, path: string): Promise<Result> {
  const url = new URL(path, origin(name));
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(timeoutMs),
  });
  await response.body?.cancel();
  return response.status === 200 ? 'ok' : 'http_status';
}

async function checkDatabase(): Promise<Result> {
  let url: URL;
  try {
    url = new URL(requireSetting('OPS_DB_URL'));
  } catch {
    throw new ConfigurationError();
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new ConfigurationError();
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await assertPortalDatabaseRole(client);
    await client.query('SELECT 1');
    return 'ok';
  } finally {
    await client.end();
  }
}

async function checkDisk(): Promise<Result> {
  const minimum = BigInt(limit('OPS_DISK_MIN_FREE_PERCENT', 100));
  const space = await statfs(requireSetting('OPS_FILESYSTEM'), {
    bigint: true,
  });
  if (space.blocks <= BigInt(0)) return 'indisponivel';
  return space.bavail * BigInt(100) >= space.blocks * minimum
    ? 'ok'
    : 'pouco_espaco';
}

async function checkBackup(): Promise<Result> {
  const maximumAgeMs = limit('OPS_BACKUP_MAX_AGE_HOURS', 8760) * hourMs;
  const file = await open(
    requireSetting('OPS_BACKUP_RECEIPT'),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!(await file.stat()).isFile()) return 'comprovante_invalido';
    const buffer = Buffer.alloc(513);
    const { bytesRead } = await file.read(buffer);
    if (bytesRead > 512) return 'comprovante_invalido';
    let receipt: unknown;
    try {
      receipt = JSON.parse(buffer.toString('utf8', 0, bytesRead));
    } catch {
      return 'comprovante_invalido';
    }
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      !('verifiedAt' in receipt) ||
      typeof receipt.verifiedAt !== 'string'
    )
      return 'comprovante_invalido';
    const verified = new Date(receipt.verifiedAt);
    if (
      !Number.isFinite(verified.valueOf()) ||
      verified.toISOString() !== receipt.verifiedAt
    )
      return 'comprovante_invalido';
    const age = Date.now() - verified.getTime();
    if (age < -60_000) return 'comprovante_invalido';
    return age <= maximumAgeMs ? 'ok' : 'backup_atrasado';
  } finally {
    await file.close();
  }
}

async function checkCertificate(name: string): Promise<Result> {
  const url = origin(name);
  if (url.protocol === 'http:') return 'local_http';
  const thresholdMs = limit('OPS_TLS_MIN_DAYS', 365) * 24 * hourMs;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const socket = connect({
      host,
      port: url.port ? Number(url.port) : 443,
      ...(isIP(host) ? {} : { servername: host }),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
    const timer = setTimeout(
      () => socket.destroy(new Error('Tempo de TLS esgotado.')),
      timeoutMs,
    );
    socket.once('close', () => {
      clearTimeout(timer);
      resolve('indisponivel');
    });
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      const expiresAt = Date.parse(socket.getPeerCertificate().valid_to ?? '');
      socket.destroy();
      if (!Number.isFinite(expiresAt)) resolve('indisponivel');
      else
        resolve(
          expiresAt - Date.now() >= thresholdMs
            ? 'ok'
            : 'certificado_proximo_do_vencimento',
        );
    });
  });
}

async function probe(name: string, check: () => Promise<Result>) {
  let result: Result;
  try {
    result = await check();
  } catch (error) {
    result =
      error instanceof ConfigurationError ? 'configuracao' : 'indisponivel';
  }
  return { name, result };
}

async function main() {
  const runId = randomUUID();
  const checks = await Promise.all([
    probe('site', () => checkHttp('OPS_SITE_ORIGIN', '/')),
    probe('portal', () => checkHttp('OPS_PORTAL_ORIGIN', '/login')),
    probe('banco', checkDatabase),
    probe('disco', checkDisk),
    probe('backup', checkBackup),
    probe('certificado_site', () => checkCertificate('OPS_SITE_ORIGIN')),
    probe('certificado_portal', () => checkCertificate('OPS_PORTAL_ORIGIN')),
  ]);
  let alerted = false;
  for (const { name, result } of checks) {
    const state =
      result === 'ok' ? 'ok' : result === 'local_http' ? 'local' : 'alerta';
    if (state === 'alerta') alerted = true;
    console.log(
      JSON.stringify({
        event: 'operational_check',
        entryPoint: 'cli',
        runId,
        at: new Date().toISOString(),
        check: name,
        state,
        result,
      }),
    );
  }
  if (alerted) process.exitCode = 1;
}

void main();
