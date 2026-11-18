import assert from 'node:assert/strict';
import { crossAppDestination } from '../../../shared/navigation/cross-app-destination';

const production = { development: false, port: 3001 };
const development = { development: true, port: 3001 };

for (const invalid of [
  undefined,
  '',
  'https://conta:senha@portal.example.invalid/login',
  'https://portal.example.invalid/login?email=fixture',
  'http://portal.example.invalid/login',
  'https://portal.example.invalid/login#fixture',
  'file:///tmp/test',
]) {
  assert.equal(crossAppDestination(invalid, production), null);
}
assert.deepEqual(
  crossAppDestination('https://portal.example.invalid/login', {
    ...production,
    requestHost: 'externo.example.invalid',
  }),
  { href: 'https://portal.example.invalid/', developmentPort: undefined },
);
assert.deepEqual(
  crossAppDestination('http://127.0.0.1:3002/login', {
    ...development,
    requestHost: '192.168.0.10:3000',
  }),
  { href: 'http://127.0.0.1:3002/', developmentPort: undefined },
);
assert.deepEqual(
  crossAppDestination(undefined, {
    ...development,
    requestHost: '192.168.0.10:3000',
  }),
  { href: 'http://192.168.0.10:3001/', developmentPort: 3001 },
);
assert.deepEqual(
  crossAppDestination(undefined, {
    ...development,
    requestHost: 'externo.example.invalid',
  }),
  { href: 'http://localhost:3001/', developmentPort: 3001 },
);
console.log(
  'OK: endereço do portal só vem da configuração válida em produção, com porta local explícita preservada.',
);
