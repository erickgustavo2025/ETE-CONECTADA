import assert from 'node:assert/strict';
import { declarationMode } from '../src/lib/declaration-configuration';
for (const NODE_ENV of ['development', 'test', 'production', '']) {
  assert.equal(declarationMode({ NODE_ENV }), null);
  const preview = { NODE_ENV, DECLARATION_REGISTRY_PREVIEW: 'true' };
  assert.equal(
    declarationMode(preview),
    ['development', 'test'].includes(NODE_ENV) ? 'PREVIEW' : null,
  );
  for (const DECLARATION_ISSUANCE_MODE of ['', 'true', 'SCHOOL', 'unsafe'])
    assert.equal(
      declarationMode({ ...preview, DECLARATION_ISSUANCE_MODE }),
      null,
    );
  const school = { NODE_ENV, DECLARATION_ISSUANCE_MODE: 'school' };
  for (const PORTAL_PUBLIC_URL of [
    undefined,
    '',
    'http://school.example',
    'https://user:pass@school.example',
    'https://school.example/path',
    'https://school.example/?q=a',
    'https://school.example/#a',
    'https://' + 'a'.repeat(140) + '.example',
  ])
    assert.equal(declarationMode({ ...school, PORTAL_PUBLIC_URL }), null);
  assert.equal(
    declarationMode({ ...school, PORTAL_PUBLIC_URL: 'https://school.example' }),
    NODE_ENV ? 'SCHOOL' : null,
  );
  assert.equal(
    declarationMode({ ...school, PORTAL_PUBLIC_URL: 'http://127.0.0.1:3002' }),
    ['development', 'test'].includes(NODE_ENV) ? 'SCHOOL' : null,
  );
}
console.log(
  'OK: configuração escolar explícita, origem segura, falha fechada e preview legado separado.',
);

const original = process.env.PORTAL_PUBLIC_URL;
try {
  process.env.PORTAL_PUBLIC_URL = 'https://unrelated.example';
  assert.equal(
    declarationMode({
      NODE_ENV: 'production',
      DECLARATION_ISSUANCE_MODE: 'school',
    }),
    null,
  );
} finally {
  if (original === undefined) delete process.env.PORTAL_PUBLIC_URL;
  else process.env.PORTAL_PUBLIC_URL = original;
}
