import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';

export function networkState(addresses, routes, dns) {
  assert.ok(Array.isArray(addresses) && Array.isArray(routes));
  assert.equal(typeof dns, 'string');
  const stable = (items) =>
    items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const interfaces = stable(
    addresses.map((item) => ({
      index: item.ifindex,
      name: item.ifname,
      state: item.operstate,
      flags: stable([...(item.flags ?? [])]),
      addresses: stable(
        (item.addr_info ?? []).map((a) => ({
          family: a.family,
          address: a.local,
          prefix: a.prefixlen,
          scope: a.scope,
          tentative: a.tentative === true,
          failed: a.dadfailed === true,
        })),
      ),
    })),
  );
  const routing = stable(
    routes.map((r) => ({
      dst: r.dst,
      gateway: r.gateway,
      dev: r.dev,
      type: r.type,
      table: r.table,
      scope: r.scope,
    })),
  );
  return {
    pending: interfaces.some((i) =>
      i.addresses.some((a) => a.tentative || a.failed),
    ),
    fingerprint: createHash('sha256')
      .update(JSON.stringify([interfaces, routing, dns]))
      .digest('hex'),
  };
}
function readNetwork() {
  const ip = (...args) =>
    JSON.parse(
      execFileSync('ip', ['-j', ...args], {
        encoding: 'utf8',
        timeout: 2000,
        maxBuffer: 256 * 1024,
      }),
    );
  return networkState(
    ip('address', 'show'),
    [...ip('-4', 'route', 'show'), ...ip('-6', 'route', 'show')],
    readFileSync('/etc/resolv.conf', 'utf8'),
  );
}

// Apenas preparação do laboratório Linux; não altera rede nem repete requisições.
export async function waitForNetworkStability({
  read = readNetwork,
  now = () => performance.now(),
  sleep = pause,
  quietMs = 2000,
  timeoutMs = 12000,
  pollMs = 200,
} = {}) {
  const started = now();
  let previous,
    quietSince = started;
  while (now() - started <= timeoutMs) {
    const current = read();
    assert.equal(typeof current.fingerprint, 'string');
    assert.equal(typeof current.pending, 'boolean');
    if (current.pending || previous !== current.fingerprint) quietSince = now();
    previous = current.fingerprint;
    if (!current.pending && now() - quietSince >= quietMs) return;
    await sleep(pollMs);
  }
  throw new Error(
    'Rede do laboratório não estabilizou antes da jornada; teste não iniciado.',
  );
}
