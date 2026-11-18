import assert from 'node:assert/strict';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { hashPassword } from '../src/lib/password';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const students: string[] = [];
  const cookies: Record<string, string> = {};
  const post = (
    path: string,
    body: string,
    cookie: string,
    origin: string | null = base,
    type = 'application/json',
  ) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': type,
      },
      body,
    });
  // Não termina o upload antes do prazo: a resposta precisa vir do limite do
  // handler, sem depender de Content-Length nem de materializar o corpo inteiro.
  const openUpload = (path: string, bytes: number, cookie?: string) =>
    new Promise<{ early: boolean; status: number }>((resolve, reject) => {
      let ended = false;
      const pending = request(
        `${base}${path}`,
        {
          method: 'POST',
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            Origin: base,
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          const early = !ended;
          response.resume();
          response.once('error', reject);
          response.once('end', () => {
            clearTimeout(timer);
            resolve({ early, status: response.statusCode! });
            pending.destroy();
          });
        },
      );
      pending.once('error', reject);
      const timer = setTimeout(() => {
        ended = true;
        pending.end('"}');
      }, 5000);
      pending.write('{"padding":"' + 'x'.repeat(bytes));
    });
  try {
    for (const role of ['student', 'secretary'] as const) {
      const email = `${randomUUID()}@eteconectada.invalid`,
        password = 'CorpoSintetico#123';
      const student = await db.student.create({
        data: {
          birthDate: new Date('2008-01-15T00:00:00Z'),
          fullName: 'Conta sintética de limites',
          account: {
            create: {
              email,
              role,
              status: 'active',
              passwordHash: await hashPassword(password),
            },
          },
        },
      });
      students.push(student.id);
      const login = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ identifier: email, password }),
      });
      assert.equal(login.status, 200);
      cookies[role] = login.headers.get('set-cookie')!.split(';')[0];
    }
    const accountsBefore = await db.account.findMany({
      where: { studentId: { in: students } },
      orderBy: { id: 'asc' },
    });
    const sessionsBefore = await db.session.count();
    const endpoints = [
      {
        path: '/api/declaracao/solicitacoes',
        limit: 1000,
        role: 'student',
        warm: 400,
      },
      {
        path: '/api/secretaria/solicitacoes',
        limit: 1000,
        role: 'secretary',
        warm: 400,
      },
      {
        path: '/api/secretaria/alunos',
        limit: 4096,
        role: 'secretary',
        warm: 200,
      },
      {
        path: '/api/secretaria/declaracao',
        limit: 16000,
        role: 'secretary',
        warm: 400,
      },
      {
        path: '/api/secretaria/declaracoes',
        limit: 400000,
        role: 'secretary',
        warm: 400,
      },
    ];
    for (const { path, limit, role, warm } of endpoints) {
      const cookie = cookies[role];
      const response = await post(path, '{}', cookie);
      assert.equal(
        response.status,
        warm,
        'Corpo pequeno precisa alcançar a validação normal.',
      );
      await response.text(); // Compila o endpoint antes de medir a interrupção do stream.
      assert.deepEqual(
        await openUpload(path, limit + 64, cookie),
        { early: true, status: 413 },
        'API privada precisa recusar o excesso antes de receber o restante do upload.',
      );
      for (const invalid of ['{', 'null', '[]']) {
        const bad = await post(path, invalid, cookie);
        assert.equal(bad.status, 400);
        assert.match(bad.headers.get('cache-control') ?? '', /no-store/);
        assert.equal(bad.headers.get('x-content-type-options'), 'nosniff');
      }
      assert.equal(
        (await post(path, '{}', cookie, base, 'text/plain')).status,
        415,
      );
      assert.equal((await post(path, '{}', cookie, null)).status, 403);
      assert.equal(
        (await post(path, '{}', cookie, 'https://wrong.invalid')).status,
        403,
      );
      assert.deepEqual(await openUpload(path, limit + 64), {
        early: true,
        status: 401,
      });
      if (role === 'secretary')
        assert.deepEqual(await openUpload(path, limit + 64, cookies.student), {
          early: true,
          status: 403,
        });
    }
    assert.equal(await db.declarationRequest.count(), 0);
    assert.equal(await db.session.count(), sessionsBefore);
    assert.deepEqual(
      await db.account.findMany({
        where: { studentId: { in: students } },
        orderBy: { id: 'asc' },
      }),
      accountsBefore,
    );
    console.log(
      'OK: cinco APIs privadas recusam excesso antes de EOF, mantêm origem/papel, mídia/JSON/headers privados e nenhuma escrita escolar.',
    );
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
