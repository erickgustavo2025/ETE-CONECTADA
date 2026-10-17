import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/password';
import { requestPasswordReset } from '../src/lib/password-reset';
import {
  consumeAccessAttempt,
  accessBucketCapacity,
} from '../src/lib/access-throttle';
import { openTestEnvironment, reportTestFailure } from './test-environment';

function syntheticCpf() {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (let n = 9; n < 11; n++) {
    const digit =
      (digits.reduce((sum, value, i) => sum + value * (n + 1 - i), 0) * 10) %
      11;
    digits.push(digit === 10 ? 0 : digit);
  }
  return digits.join('');
}
function worker(
  identifier: string,
  timezone: 'utc' | 'fortaleza',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(
          new URL('./test-access-throttle-worker.ts', import.meta.url),
        ),
        identifier,
        timezone,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
    );
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.once('close', () => clearTimeout(timeout));
    let output = '';
    child.stdout.on('data', (value: Buffer) => {
      output = (output + value.toString()).slice(-1024);
    });
    child.stderr.resume();
    child.once('error', () =>
      reject(new Error('Worker sintético não iniciou.')),
    );
    child.once('exit', (code) => {
      if (code !== 0) return reject(new Error('Worker sintético falhou.'));
      try {
        const value = JSON.parse(output);
        assert.ok(Number.isInteger(value.allowed));
        resolve(value.allowed);
      } catch {
        reject(new Error('Resposta inválida do worker sintético.'));
      }
    });
  });
}
async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const login = (
    identifier: string,
    password: string,
    headers?: Record<string, string>,
  ) => post('/api/login', { identifier, password, role: 'secretary' }, headers);
  const clear = () => db.accessAttemptBucket.deleteMany();
  const expire = () => db.$executeRaw`UPDATE access_attempt_buckets
    SET window_started_at = clock_timestamp() - interval '2 minutes',
        expires_at = clock_timestamp() - interval '1 minute'`;
  const password = randomBytes(24).toString('base64url');
  const wrong = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  async function fixture() {
    const student = await db.student.create({
      data: {
        fullName: 'Aluno fictício de limite de acesso',
        cpf: syntheticCpf(),
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15T00:00:00Z'),
        registrationAllowed: true,
        details: {
          create: {
            parentOne: 'Filiação Fictícia Completa',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    ids.push(student.id);
    const email = `tentativas-${student.id}@eteconectada.invalid`;
    const account = await db.account.create({
      data: { studentId: student.id, email, status: 'active', passwordHash },
    });
    return { student, email, account };
  }
  try {
    const a = await fixture(),
      b = await fixture();
    for (let n = 0; n < 10; n++)
      assert.equal((await login(a.email, wrong)).status, 401);
    const blocked = await login(a.email, wrong);
    if (blocked.status !== 429)
      console.error('EC060: limite esperado429, recebido', blocked.status);
    assert.equal(
      blocked.status,
      429,
      'A décima primeira tentativa deve ser pausada.',
    );
    const retry = Number(blocked.headers.get('retry-after'));
    assert.ok(retry > 0 && retry <= 300);
    assert.match(blocked.headers.get('cache-control')!, /no-store/);
    assert.deepEqual(Object.keys(await blocked.json()), ['error']);
    const before = await db.accessAttemptBucket.findMany({
      where: { used: 10 },
      orderBy: { key: 'asc' },
    });
    assert.equal(
      (
        await login(`  ${a.email.toUpperCase()}  `, wrong, {
          'X-Forwarded-For': '198.51.100.4',
          'X-Real-IP': '203.0.113.9',
        })
      ).status,
      429,
    );
    const after = await db.accessAttemptBucket.findMany({
      where: { used: 10 },
      orderBy: { key: 'asc' },
    });
    assert.deepEqual(
      after,
      before,
      'Tentar durante a pausa não aumenta nem renova a janela individual.',
    );
    assert.equal(
      await db.session.count({ where: { accountId: a.account.id } }),
      0,
    );
    const otherLogin = await login(b.email, password);
    assert.equal(
      otherLogin.status,
      200,
      'Outro aluno na mesma rede continua entrando.',
    );
    const studentCookie = otherLogin.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (await post('/api/secretaria/alunos', {}, { Cookie: studentCookie }))
        .status,
      403,
      'Papel forjado no login não libera API da secretaria.',
    );
    for (let n = 0; n < 10; n++)
      assert.equal((await login(b.email, wrong)).status, 401);
    assert.equal((await login(b.email, wrong)).status, 429);
    const owner = await fetch(`${base}/api/declaracao/solicitacoes`, {
      headers: { Cookie: studentCookie },
    });
    assert.equal(
      owner.status,
      200,
      'Tentativas anônimas não revogam sessão já autorizada.',
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: b.account.id } }))
        .role,
      'student',
      'Papel enviado no corpo não concede secretaria.',
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: a.account.id } }))
        .status,
      'active',
    );
    console.log(
      'OK: rajada, resposta privada, normalização, cabeçalhos falsos e isolamento sem bloqueio da conta.',
    );

    await clear();
    for (let n = 0; n < 10; n++)
      assert.equal(
        (await login(n % 2 ? a.email : a.student.cpf!, wrong)).status,
        401,
      );
    assert.equal(
      (await login(a.email, wrong)).status,
      429,
      'Alternar CPF/e-mail não duplica o orçamento da conta.',
    );
    assert.equal((await login(a.student.cpf!, wrong)).status, 429);
    await expire();
    assert.equal(
      (await login(a.email, password)).status,
      200,
      'Acesso retorna após a expiração, inclusive em banco com fuso diferente de UTC.',
    );
    for (let n = 0; n < 11; n++)
      assert.equal(
        (await login(a.email, password)).status,
        200,
        'Logins corretos não acumulam falhas individuais.',
      );
    console.log('OK: aliases, expiração e autenticação correta.');

    await clear();
    const unknown = `ausente-${randomBytes(8).toString('hex')}@eteconectada.invalid`;
    for (let n = 0; n < 10; n++)
      assert.equal((await login(unknown, wrong)).status, 401);
    const unknownBlocked = await login(unknown, wrong);
    assert.equal(
      unknownBlocked.status,
      429,
      'Identificador inexistente segue a mesma política.',
    );
    assert.deepEqual(Object.keys(await unknownBlocked.json()), ['error']);
    const rawKeys = await db.accessAttemptBucket.findMany();
    for (const row of rawKeys) assert.match(row.key, /^[0-9a-f]{64}$/);
    assert.equal(
      JSON.stringify(rawKeys).includes(unknown),
      false,
      'Contadores não guardam identificador puro.',
    );

    await clear();
    const school = {
      schoolRegistration: a.student.schoolRegistration,
      birthDate: '2008-01-15',
      parentName: 'Filiação incorreta fictícia',
    };
    for (let n = 0; n < 20; n++) {
      const response =
        n % 2 === 0
          ? await post('/api/registration/check', school)
          : await post('/api/registration/start', {
              ...school,
              cpf: a.student.cpf,
              email: a.email,
              password,
              confirmPassword: password,
            });
      assert.equal(response.status, n % 2 === 0 ? 200 : 400);
    }
    assert.equal((await post('/api/registration/check', school)).status, 429);
    assert.equal(
      (
        await post('/api/registration/start', {
          ...school,
          cpf: a.student.cpf,
          email: a.email,
          password,
          confirmPassword: password,
        })
      ).status,
      429,
    );
    const otherSchool = await post('/api/registration/check', {
      ...school,
      schoolRegistration: b.student.schoolRegistration,
    });
    assert.equal(otherSchool.status, 200, 'Outra matrícula não herda a pausa.');
    assert.equal(
      await db.emailVerificationToken.count(),
      0,
      'Filiação errada não gera link de cadastro.',
    );
    console.log(
      'OK: orçamento de matrícula compartilhado por check/start, sem ativação ou envio de e-mail.',
    );

    await clear();
    for (let n = 0; n < 10; n++) await login(a.email, wrong);
    assert.equal((await login(a.email, password)).status, 429);
    let link = '';
    await requestPasswordReset(db, a.email, {
      origin: base,
      async send(_to, url) {
        link = url;
      },
    });
    assert.ok(link);
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
    const nextPassword = randomBytes(24).toString('base64url');
    assert.equal(
      (
        await post('/api/password-reset/confirm', {
          token,
          password: nextPassword,
          confirmPassword: nextPassword,
        })
      ).status,
      200,
    );
    assert.equal(
      (await login(a.email, nextPassword)).status,
      200,
      'Reset confirmado libera login com a nova senha.',
    );
    assert.equal((await login(a.email, password)).status, 401);
    console.log(
      'OK: recuperação conferida libera nova senha sem remover o orçamento global.',
    );

    await clear();
    const shared = `ec060-${randomBytes(8).toString('hex')}`;
    const results = await Promise.allSettled([
      worker(shared, 'utc'),
      worker(shared, 'fortaleza'),
    ]);
    const admissions = results.map((result) => {
      assert.equal(
        result.status,
        'fulfilled',
        'Os dois workers devem terminar com sucesso.',
      );
      if (result.status !== 'fulfilled')
        throw new Error('Worker sintético falhou.');
      return result.value;
    });
    assert.equal(
      admissions.reduce((sum, count) => sum + count, 0),
      10,
      'Dois processos compartilham o limite de dez admissões.',
    );
    assert.ok(
      (await db.accessAttemptBucket.findMany()).some((row) => row.used === 24),
      'Tentativas recusadas também contam no orçamento global.',
    );
    console.log('OK: concorrência entre dois processos Node independentes.');

    await clear();
    await consumeAccessAttempt(db, 'login', 'global-fixture');
    const global = (
      await db.accessAttemptBucket.findMany({ orderBy: { expiresAt: 'asc' } })
    )[0];
    await db.accessAttemptBucket.update({
      where: { key: global.key },
      data: { used: 600 },
    });
    assert.equal(
      (await consumeAccessAttempt(db, 'login', 'novo-identificador')).allowed,
      false,
      'Rotação de identificadores não contorna o orçamento global.',
    );
    await expire();
    assert.equal(
      (await consumeAccessAttempt(db, 'login', 'nova-janela')).allowed,
      true,
    );
    await db.accessAttemptBucket.deleteMany();
    await consumeAccessAttempt(db, 'login', 'capacity-fixture');
    const remaining =
      accessBucketCapacity - (await db.accessAttemptBucket.count());
    await db.$executeRaw`INSERT INTO access_attempt_buckets (key, used, window_started_at, expires_at)
      SELECT md5('ec060-a-' || n::text) || md5('ec060-b-' || n::text), 1, now(), now() + interval '15 minutes'
      FROM generate_series(1, ${remaining}::integer) n`;
    assert.equal(
      (await consumeAccessAttempt(db, 'registration', 'identidade-inventada'))
        .allowed,
      false,
    );
    assert.equal(
      await db.accessAttemptBucket.count(),
      accessBucketCapacity,
      'Não ultrapassa o teto de registros.',
    );
    await expire();
    await db.$executeRaw`UPDATE access_throttle_state SET last_sweep_at = clock_timestamp() - interval '2 minutes' WHERE id = 1`;
    assert.equal(
      (await consumeAccessAttempt(db, 'login', 'apos-limpeza')).allowed,
      true,
    );
    assert.equal(
      await db.accessAttemptBucket.count(),
      2,
      'Expirados são removidos automaticamente.',
    );
    console.log(
      'OK: janela global, teto de cardinalidade e coleta de expirados.',
    );

    await clear();
    await consumeAccessAttempt(db, 'login', 'rollback-prime');
    const globalBefore = (
      await db.accessAttemptBucket.findMany({ orderBy: { expiresAt: 'asc' } })
    )[0];
    await db.$executeRaw`CREATE FUNCTION ec060_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$`;
    try {
      await db.$executeRaw`CREATE TRIGGER ec060_reject_insert BEFORE INSERT ON access_attempt_buckets FOR EACH ROW EXECUTE FUNCTION ec060_reject_insert()`;
      assert.equal(
        (await login('rollback-novo@eteconectada.invalid', wrong)).status,
        503,
      );
      assert.equal(
        (
          await db.accessAttemptBucket.findUniqueOrThrow({
            where: { key: globalBefore.key },
          })
        ).used,
        globalBefore.used,
        'Falha posterior à cobrança desfaz toda a admissão.',
      );
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS ec060_reject_insert ON access_attempt_buckets`;
      await db.$executeRaw`DROP FUNCTION IF EXISTS ec060_reject_insert()`;
    }
    console.log(
      'OK: falha após escrita desfaz os contadores e não libera login.',
    );

    for (const path of [
      '/api/registration/verify',
      '/api/password-reset/confirm',
    ]) {
      await clear();
      const token = randomBytes(32).toString('base64url');
      const body = { token, password, confirmPassword: password };
      for (let n = 0; n < 10; n++)
        assert.equal((await post(path, body)).status, 400);
      assert.equal(
        (await post(path, body)).status,
        429,
        'Verificação de link também deve limitar repetição.',
      );
      assert.equal(
        JSON.stringify(await db.accessAttemptBucket.findMany()).includes(token),
        false,
        'O token puro não fica no contador.',
      );
    }
    let receipt: unknown;
    for (const email of [b.email, 'recuperacao-ausente@eteconectada.invalid']) {
      await clear();
      for (let n = 0; n < 5; n++) {
        const response = await post('/api/password-reset/request', { email });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control')!, /no-store/);
        const body = await response.json();
        if (receipt)
          assert.deepEqual(
            body,
            receipt,
            'Resposta de recuperação não revela se há conta.',
          );
        receipt = body;
      }
      assert.equal(
        (await post('/api/password-reset/request', { email })).status,
        429,
      );
    }
    console.log(
      'OK: links e recuperação também têm orçamento, sem revelar conta ou persistir token puro.',
    );

    const state = await db.accessThrottleState.findUniqueOrThrow({
      where: { id: 1 },
    });
    await db.accessThrottleState.delete({ where: { id: 1 } });
    try {
      assert.equal(
        (await login(b.email, password)).status,
        503,
        'Falha do limiter não libera autenticação.',
      );
    } finally {
      await db.accessThrottleState.create({ data: state });
    }
    assert.equal((await login(b.email, password)).status, 200);
    console.log(
      'OK: erro do armazenamento recusa acesso e restauração recupera o serviço.',
    );
  } finally {
    try {
      if (ids.length)
        await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await environment.close();
    }
  }
}
main().catch(reportTestFailure);
