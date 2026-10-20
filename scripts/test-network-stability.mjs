import assert from 'node:assert/strict';
import { networkState, waitForNetworkStability } from './network-stability.mjs';

const address = [
  {
    ifname: 'fixture',
    ifindex: 1,
    flags: ['UP'],
    addr_info: [
      { family: 'inet6', local: '::1', prefixlen: 128, valid_life_time: 100 },
    ],
  },
];
const one = networkState(address, [], 'nameserver 127.0.0.1');
assert.deepEqual(
  one,
  networkState(
    [
      {
        ...address[0],
        addr_info: [{ ...address[0].addr_info[0], valid_life_time: 99 }],
      },
    ],
    [],
    'nameserver 127.0.0.1',
  ),
);
assert.notEqual(
  one.fingerprint,
  networkState(
    address,
    [{ dst: 'default', dev: 'fixture' }],
    'nameserver 127.0.0.1',
  ).fingerprint,
);
assert.notEqual(
  one.fingerprint,
  networkState(address, [], 'nameserver ::1').fingerprint,
);
assert.equal(
  networkState(
    [
      {
        ...address[0],
        addr_info: [{ ...address[0].addr_info[0], tentative: true }],
      },
    ],
    [],
    '',
  ).pending,
  true,
);
assert.throws(() => networkState({}, [], ''));

let clock = 0;
await waitForNetworkStability({
  read: () => ({
    fingerprint: clock < 600 ? 'before' : 'after',
    pending: false,
  }),
  now: () => clock,
  sleep: async (ms) => {
    clock += ms;
  },
});
assert.equal(
  clock,
  2600,
  'Mudança durante a janela reinicia a contagem completa.',
);
clock = 0;
await assert.rejects(
  () =>
    waitForNetworkStability({
      read: () => ({ fingerprint: String(clock), pending: false }),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      timeoutMs: 2400,
    }),
  /não estabilizou/,
);
clock = 0;
await assert.rejects(
  () =>
    waitForNetworkStability({
      read: () => ({ fingerprint: 'unchanged', pending: true }),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      timeoutMs: 2400,
    }),
  /não estabilizou/,
);
await assert.rejects(
  () =>
    waitForNetworkStability({
      read: () => {
        throw new Error('leitura indisponível');
      },
    }),
  /leitura indisponível/,
);
console.log(
  'OK: prontidão de rede exige janela contínua, reinicia após mudança e recusa instabilidade ou leitura inválida.',
);
