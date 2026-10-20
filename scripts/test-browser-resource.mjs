import assert from 'node:assert/strict';
import { cancelledEntryPrefetch } from './browser-resource.mjs';
const origin = 'https://portal.example.invalid:8443';
const prefetch = {
  error: 'net::ERR_ABORTED',
  type: 'fetch',
  method: 'GET',
  headers: { 'next-router-prefetch': '1', rsc: '1' },
  url: `${origin}/cadastro?_rsc=fixture`,
};
assert.equal(cancelledEntryPrefetch(prefetch, origin), true);
assert.equal(
  cancelledEntryPrefetch(
    { ...prefetch, url: `${origin}/recuperar-acesso` },
    origin,
  ),
  true,
);
for (const change of [
  { error: 'net::ERR_NETWORK_CHANGED' },
  { error: 'net::ERR_CONNECTION_REFUSED' },
  { type: 'image' },
  { type: 'script' },
  { type: 'document' },
  { method: 'POST' },
  { headers: {} },
  { headers: { rsc: '1' } },
  { headers: { 'next-router-prefetch': '1' } },
  { url: `${origin}/_next/image` },
  { url: `${origin}/api/login` },
  { url: 'https://other.example.invalid/cadastro' },
])
  assert.equal(
    cancelledEntryPrefetch({ ...prefetch, ...change }, origin),
    false,
  );
console.log(
  'OK: só cancelamento de prefetch RSC das entradas públicas é classificado; recursos reais e demais falhas continuam recusados.',
);
