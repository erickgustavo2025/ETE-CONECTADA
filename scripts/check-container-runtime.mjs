import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';

const app = process.env.TEST_APP;
assert.ok(['site', 'portal'].includes(app));
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(
  process.versions.node,
  '24.22.1',
  'Runtime Node fora da revisão conferida.',
);
assert.notEqual(
  process.getuid(),
  0,
  'Runtime deve usar usuário sem privilégios.',
);
const apkPackages = (await readFile('/lib/apk/db/installed', 'utf8')).split(
  '\n\n',
);
for (const name of ['musl', 'musl-utils']) {
  const entry = apkPackages.find((item) =>
    item.split('\n').includes(`P:${name}`),
  );
  assert.match(entry ?? '', /^V:1\.2\.6-r3$/m, 'Correção do musl ausente.');
}
await access('/app/licenses/third-party/qrcode-generator-MIT.txt');
for (const name of ['Manrope-OFL.txt', 'SourceSans3-OFL.txt'])
  await access(`/app/licenses/fonts/${name}`);
for (const file of [
  '/app/.env',
  '/app/tasks',
  '/app/output',
  '/usr/local/lib/node_modules/npm',
  '/opt/yarn-v1.22.22',
])
  await assert.rejects(access(file), { code: 'ENOENT' });

let connections = 0;
const probe = createServer((socket) => {
  connections++;
  socket.destroy();
});
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(5432, '127.0.0.1', resolve);
});
const base = 'http://127.0.0.1:3000';
const request = (url, init) =>
  fetch(new URL(url, base), {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
try {
  const entry = app === 'portal' ? '/login' : '/';
  const deadline = Date.now() + 60_000;
  while (true) {
    try {
      if ((await request(entry)).status === 200) break;
    } catch {
      /* Somente o container próprio. */
    }
    assert.ok(Date.now() < deadline, 'O servidor não iniciou no prazo.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const response = await request(entry);
  const html = await response.text();
  assert.match(
    response.headers.get('content-security-policy'),
    /'nonce-[^']+'/,
  );
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(scripts.length > 0, 'HTML precisa carregar os scripts do app.');
  for (const script of scripts) {
    assert.ok(script.startsWith('/_next/'));
    assert.equal(
      (await request(script)).status,
      200,
      'Script do build deve estar na imagem.',
    );
  }
  assert.equal((await request('/images/governo.png')).status, 200);
  // Confere a biblioteca nativa na mesma libc e arquitetura do servidor.
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const sharp = require('sharp');
  const converted = await sharp(await readFile('public/images/governo.png'))
    .resize(10)
    .png()
    .toBuffer();
  assert.equal(converted.subarray(1, 4).toString(), 'PNG');
  if (app === 'portal') {
    for (const name of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
      const font = await readFile(`src/assets/fonts/${name}`);
      assert.ok(font.length > 100_000);
      assert.equal(font.readUInt32BE(0), 0x00010000);
    }
    const xlsx = require('xlsx');
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([['Matrícula'], ['00123456']]),
      'Fictícia',
    );
    const restored = xlsx.read(
      xlsx.write(workbook, { type: 'buffer', bookType: 'biff8' }),
      { type: 'buffer' },
    );
    assert.equal(
      xlsx.utils.sheet_to_json(restored.Sheets.Fictícia)[0].Matrícula,
      '00123456',
    );
    for (const [url, status] of [
      ['/api/login', 404],
      ['/api/registration/check', 503],
      ['/api/registration/start', 503],
      ['/api/registration/verify', 503],
      ['/api/password-reset/request', 503],
      ['/api/password-reset/confirm', 503],
      ['/api/declaracao/solicitacoes', 401],
      ['/api/secretaria/importacao', 401],
      ['/api/secretaria/calendarios', 401],
      ['/api/secretaria/declaracao', 401],
      ['/api/secretaria/declaracoes', 401],
    ]) {
      const denied = await request(url, {
        method: 'POST',
        headers: {
          Origin: 'https://portal.example.invalid',
          'Content-Type': 'application/json',
          Cookie: `__Host-ete_portal_session=${'A'.repeat(43)}`,
          'X-Role': 'secretary',
        },
        body: '{}',
      });
      assert.equal(
        denied.status,
        status,
        'Produção continua bloqueada e papel forjado não autoriza.',
      );
      assert.equal(denied.headers.get('set-cookie'), null);
      assert.deepEqual(Object.keys(await denied.json()), ['error']);
    }
  }
  assert.equal(
    connections,
    0,
    'Operações bloqueadas não devem consultar o banco.',
  );
  console.log(
    `OK: imagem ${app}, usuário sem root, scripts/arquivos/nativos, segurança e bloqueios de produção.`,
  );
} finally {
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
}
