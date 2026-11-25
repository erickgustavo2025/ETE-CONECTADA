import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { findSessionRecord } from '../src/lib/session-record';
import { hashPassword } from '../src/lib/password';
import { claimAccount } from '../src/lib/account-registration';
import { changeStaffAccess } from './staff-access';
import {
  openTestEnvironment,
  reportTestFailure,
  TestEnvironmentError,
} from './test-environment';

const portal = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const ended = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), 5000);
  try {
    await ended;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // Execute em checkout/cópia isolada, como o CI, para não carregar segredos nem substituir o build em uso.
  for (const directory of [root, portal]) {
    for (const file of [
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ]) {
      if (existsSync(`${directory}${file}`))
        throw new TestEnvironmentError(
          'Use uma cópia isolada sem arquivos .env para testar produção.',
        );
    }
  }
  const environment = await openTestEnvironment();
  const { db } = environment;
  let studentId: string | undefined;
  let child: ChildProcess | undefined;
  let connections = 0;
  const sink = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const legacyPassword = randomBytes(20).toString('base64url');
    const student = await db.student.create({
      data: {
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15T00:00:00Z'),
        fullName: 'Produção fictícia',
      },
    });
    studentId = student.id;
    const account = await db.account.create({
      data: {
        studentId,
        role: 'secretary',
        status: 'active',
        email: `producao-${studentId}@eteconectada.invalid`,
        passwordHash: await hashPassword(legacyPassword),
      },
    });
    assert.ok(account.email);
    await db.session.create({
      data: {
        tokenHash,
        accountId: account.id,
        expiresAt: new Date(Date.now() + 60000 * 60),
      },
    });
    assert.equal(
      (await findSessionRecord(db, tokenHash))?.accountId,
      account.id,
      'Controle positivo: sessão deve existir e ser válida no banco descartável.',
    );
    await new Promise<void>((resolve, reject) => {
      sink.once('error', reject);
      sink.listen(0, '127.0.0.1', resolve);
    });
    const address = sink.address();
    assert.ok(address && typeof address === 'object');
    const probeUrl = `postgresql://probe@127.0.0.1:${address.port}/ete_test_production_probe`;
    // Sem credenciais do banco da fixture. O destino não é PostgreSQL e conta qualquer tentativa de conexão.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      NODE_ENV: 'production',
      DECLARATION_REGISTRY_PREVIEW: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: probeUrl,
      DIRECT_URL: probeUrl,
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
      NEXT_PUBLIC_LAN_HOST: '',
      PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
    };
    const launch = (args: string[], cwd: string) => {
      child = spawn(process.execPath, args, {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.resume();
      child.stderr?.resume();
      return child;
    };
    const build = launch(
      [require.resolve('next/dist/bin/next'), 'build', '--webpack'],
      portal,
    );
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => controller.abort(), 180000);
      const aborted = () =>
        finish(
          new TestEnvironmentError(
            'Build de produção cancelado ou excedeu três minutos.',
          ),
        );
      controller.signal.addEventListener('abort', aborted, { once: true });
      build.once('error', () =>
        finish(new TestEnvironmentError('Não foi possível iniciar o build.')),
      );
      build.once('exit', (code) =>
        finish(
          code === 0
            ? undefined
            : new TestEnvironmentError(
                'Build de produção falhou; execute o build isolado para diagnosticar.',
              ),
        ),
      );
      if (controller.signal.aborted) aborted();
    });
    assert.equal(connections, 0, 'Build não deve conectar ao banco.');
    const listener = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', () => {
        const endpoint = listener.address();
        assert.ok(endpoint && typeof endpoint === 'object');
        listener.close((error) =>
          error ? reject(error) : resolve(endpoint.port),
        );
      });
    });
    const server = launch(
      [
        require.resolve('next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      portal,
    );
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60000;
    while (true) {
      if (
        controller.signal.aborted ||
        server.exitCode !== null ||
        server.signalCode !== null
      )
        throw new TestEnvironmentError('Servidor de produção interrompido.');
      try {
        if (
          (await fetch(`${base}/login`, { signal: AbortSignal.timeout(2000) }))
            .status === 200
        )
          break;
      } catch {
        /* Aguarda somente o servidor próprio. */
      }
      if (Date.now() > deadline)
        throw new TestEnvironmentError(
          'Servidor de produção não iniciou em um minuto.',
        );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const canonicalOrigin = 'https://portal.example.invalid';
    const request = (
      path: string,
      body?: unknown,
      sessionToken: string | null = token,
      origin = canonicalOrigin,
    ) =>
      fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'manual',
        headers: {
          ...(sessionToken
            ? { Cookie: `__Host-ete_portal_session=${sessionToken}` }
            : {}),
          'Content-Type': 'application/json',
          Origin: origin,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      });
    const cases: [string, number, unknown?][] = [
      [
        '/api/documentos/verificacao',
        404,
        { code: 'A'.repeat(43), fullName: 'Pessoa fictícia' },
      ],
      ['/api/secretaria/documentos/busca', 404, {}],
      ['/api/secretaria/alunos/administracao', 404, { operation: 'search' }],
      [
        '/api/secretaria/alunos/administracao',
        404,
        { operation: 'classes', mode: 'INTEGRADO' },
      ],
      ['/api/secretaria/alunos/situacao-escolar', 404, { operation: 'detail' }],
      ['/api/secretaria/alunos/conclusao', 404, { operation: 'candidates' }],
      ['/api/secretaria/documentos/arquivo', 404, {}],
      ['/api/declaracao/arquivo', 404, {}],
      ['/api/secretaria/documentos/alteracoes', 404, {}],
      [
        '/api/login',
        404,
        { identifier: account.email, password: 'synthetic-password' },
      ],
      [
        '/api/registration/check',
        503,
        {
          schoolRegistration: student.schoolRegistration,
          birthDate: '2008-01-15',
        },
      ],
      [
        '/api/registration/start',
        503,
        {
          schoolRegistration: student.schoolRegistration,
          birthDate: '2008-01-15',
          cpf: '52998224725',
          email: account.email,
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
        },
      ],
      ['/api/registration/verify', 503, { token }],
      ['/api/password-reset/request', 503, { email: account.email }],
      ['/api/conta/senha', 503, {}],
      ['/api/conta/email', 503, {}],
      ['/api/conta/email/confirmar', 503, {}],
      [
        '/api/password-reset/confirm',
        503,
        {
          token,
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
        },
      ],
      ['/api/declaracao/solicitacoes', 401],
      ['/api/localidades?uf=PE', 401],
      ['/api/declaracao/solicitacoes', 401, {}],
      ['/api/secretaria/solicitacoes', 401],
      ['/api/secretaria/solicitacoes', 401, {}],
      ['/api/secretaria/alunos', 401, {}],
      ['/api/secretaria/declaracao', 401, {}],
      ['/api/secretaria/declaracoes', 401, {}],
      ['/api/secretaria/importacao', 401, {}],
      ['/api/secretaria/calendarios', 401, { action: 'list' }],
    ];
    for (const [path, status, body] of cases) {
      const response = await request(path, body);
      assert.equal(
        response.status,
        status,
        `${path}: bloquear antes de autenticar/consultar dados.`,
      );
      assert.equal(response.headers.get('set-cookie'), null);
      const data = await response.json();
      assert.deepEqual(
        Object.keys(data),
        ['error'],
        `${path}: não retornar link, token ou dados privados.`,
      );
      assert.equal(typeof data.error, 'string');
    }
    const publicPage = await request('/validar/' + 'A'.repeat(43));
    assert.equal(
      publicPage.status,
      404,
      'Consulta pública experimental indisponível em produção mesmo com a chave true.',
    );
    assert.match(publicPage.headers.get('x-robots-tag') ?? '', /noindex/);
    const publicHtml = await publicPage.text();
    for (const privateValue of [
      token,
      tokenHash,
      account.email,
      student.fullName!,
    ])
      assert.ok(!publicHtml.includes(privateValue));
    const administration = await request('/secretaria/alunos');
    assert.equal(administration.status, 404);
    const registry = await request('/secretaria/declaracoes');
    assert.equal(
      registry.status,
      404,
      'Painel experimental indisponível em produção.',
    );
    const registryHtml = await registry.text();
    for (const privateValue of [
      token,
      tokenHash,
      account.email,
      student.fullName!,
    ])
      assert.ok(
        !registryHtml.includes(privateValue),
        'Página indisponível não retorna dados privados.',
      );
    for (const path of [
      '/',
      '/declaracao',
      '/secretaria/importacao/integrado',
    ]) {
      const response = await request(path);
      assert.equal(response.status, 307);
      assert.equal(
        new URL(response.headers.get('location')!, base).pathname,
        '/login',
      );
    }
    for (const path of [
      '/login',
      '/cadastro',
      '/recuperar-acesso',
      '/redefinir-senha',
    ]) {
      const response = await request(path);
      assert.equal(response.status, 200);
      const csp = response.headers.get('content-security-policy') ?? '';
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      const scriptPolicy =
        csp.split('; ').find((value) => value.startsWith('script-src ')) ?? '';
      assert.ok(!scriptPolicy.includes("'unsafe-eval'"));
      assert.ok(!scriptPolicy.includes("'unsafe-inline'"));
      const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      assert.ok(nonce);
      const html = await response.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      assert.ok(scripts.length > 0);
      for (const script of scripts)
        assert.ok(script.includes(`nonce="${nonce}"`));

      for (const privateValue of [
        token,
        tokenHash,
        account.email,
        student.fullName!,
      ])
        assert.ok(!html.includes(privateValue));
    }
    const logout = await request('/api/logout', {});
    assert.equal(logout.status, 200);
    assert.match(
      logout.headers.get('set-cookie')!,
      /^__Host-ete_portal_session=;/,
    );
    assert.match(logout.headers.get('set-cookie')!, /; Secure/i);
    assert.match(logout.headers.get('set-cookie')!, /; HttpOnly/i);
    assert.match(logout.headers.get('set-cookie')!, /; SameSite=lax/i);
    assert.doesNotMatch(logout.headers.get('set-cookie')!, /; Domain=/i);
    assert.match(logout.headers.get('cache-control')!, /no-store/);
    assert.deepEqual(await logout.json(), { ok: true });
    assert.equal(
      connections,
      0,
      'Build e rotas de produção não devem tentar conectar ao banco.',
    );
    assert.equal(
      await db.session.count({ where: { tokenHash } }),
      1,
      'Logout de produção não deve modificar sessão de desenvolvimento.',
    );
    await stop(server);
    env.DECLARATION_ISSUANCE_MODE = 'school';
    env.PORTAL_ACCESS_MODE = 'school';
    env.HTTPS_VERIFIED = 'true';
    async function startSchool() {
      const schoolServer = launch(
        [
          require.resolve('next/dist/bin/next'),
          'start',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(port),
        ],
        portal,
      );
      const until = Date.now() + 60000;
      while (Date.now() < until) {
        if (
          controller.signal.aborted ||
          schoolServer.exitCode !== null ||
          schoolServer.signalCode !== null
        )
          throw new TestEnvironmentError(
            'Servidor escolar de produção interrompido.',
          );
        try {
          if ((await request('/login')).status === 200) return schoolServer;
        } catch {
          /* Aguarda somente o servidor próprio. */
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new TestEnvironmentError(
        'Servidor escolar não iniciou em um minuto.',
      );
    }
    const schoolServer = await startSchool();
    const schoolPage = await request('/validar/' + 'A'.repeat(43));
    assert.equal(schoolPage.status, 200);
    assert.match(schoolPage.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(
      (await request('/api/documentos/verificacao', { code: 'invalid' }))
        .status,
      422,
    );
    assert.equal((await request('/secretaria/declaracoes')).status, 307);
    assert.equal(
      (await request('/api/secretaria/documentos/busca', {})).status,
      401,
    );
    assert.equal((await request('/api/secretaria/declaracao', {})).status, 410);
    assert.equal(
      (
        await request('/api/login', {
          identifier: account.email,
          password: 'synthetic-password',
        })
      ).status,
      404,
    );
    assert.equal(
      connections,
      0,
      'Configuração incompleta de e-mail mantém o acesso fechado.',
    );
    console.log(
      'Produção: configuração escolar explícita habilita somente a consulta; origem, autenticação e dados privados continuam protegidos.',
    );
    console.log(
      'Produção: build sem banco; cadastro/login bloqueados; sessão válida recusada; logout sem consulta; nenhum link/token de teste retornado.',
    );
    await stop(schoolServer);

    assert.ok(process.env.DATABASE_URL);
    env.DATABASE_URL = process.env.DATABASE_URL;
    delete env.DIRECT_URL;
    // O provedor é representado pelo transporte de captura do convite. Nenhum envio externo.
    env.EMAIL_TRANSPORT = 'smtp';
    env.EMAIL_FROM = 'secretaria@eteconectada.invalid';
    env.SMTP_HOST = '127.0.0.1';
    env.SMTP_PORT = String(address.port);
    env.SMTP_USER = 'smtp-fixture-user';
    env.SMTP_PASSWORD = randomBytes(24).toString('base64url');
    const enabled = await startSchool();
    const staffEmail = 'secretaria-producao@eteconectada.invalid';
    const invitePassword = randomBytes(20).toString('base64url');
    let inviteLink = '';
    await changeStaffAccess(
      db,
      {
        action: 'invite',
        email: staffEmail,
        name: 'Secretaria Fictícia de Produção',
        reason: 'Acesso aprovado no ensaio fictício',
      },
      {
        origin: canonicalOrigin,
        async send(to, link) {
          assert.equal(to, staffEmail);
          inviteLink = link;
        },
      },
    );
    const inviteToken = new URLSearchParams(
      new URL(inviteLink).hash.slice(1),
    ).get('token');
    const activation = {
      token: inviteToken,
      password: invitePassword,
      confirmPassword: invitePassword,
    };
    assert.equal(
      (
        await request(
          '/api/password-reset/confirm',
          activation,
          null,
          'https://externo.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (await request('/api/password-reset/confirm', activation, null)).status,
      200,
    );
    assert.equal(
      (await request('/api/password-reset/confirm', activation, null)).status,
      400,
    );
    assert.equal(
      (await request('/')).status,
      307,
      'Sessão antiga de demonstração é recusada.',
    );
    const legacyLogin = await request(
      '/api/login',
      {
        identifier: account.email,
        password: legacyPassword,
      },
      null,
    );
    assert.equal(legacyLogin.status, 401);

    const staffLogin = () =>
      request(
        '/api/login',
        { identifier: staffEmail, password: invitePassword },
        null,
      );
    async function signedInToken(result: Response) {
      assert.equal(result.status, 200);
      const cookie = result.headers.get('set-cookie') ?? '';
      const signedIn = cookie.match(
        /^__Host-ete_portal_session=([a-z0-9_-]{43});/i,
      )?.[1];
      assert.ok(signedIn);
      assert.match(cookie, /; Secure/i);
      assert.match(cookie, /; HttpOnly/i);
      assert.match(cookie, /; SameSite=lax/i);
      assert.doesNotMatch(cookie, /; Domain=/i);
      assert.equal(result.headers.get('server-timing'), null);
      return signedIn;
    }
    const staffToken = await signedInToken(await staffLogin());
    assert.equal(
      (await request('/secretaria/declaracoes', undefined, staffToken)).status,
      200,
    );
    assert.equal(
      (await request('/api/declaracao/solicitacoes', undefined, staffToken))
        .status,
      403,
    );
    assert.equal((await request('/api/logout', {}, staffToken)).status, 200);
    assert.equal((await request('/', undefined, staffToken)).status, 307);
    const revokedToken = await signedInToken(await staffLogin());
    await changeStaffAccess(db, {
      action: 'revoke',
      email: staffEmail,
      reason: 'Acesso fictício retirado no ensaio',
    });
    assert.equal(
      (await request('/secretaria/declaracoes', undefined, revokedToken))
        .status,
      307,
    );
    assert.equal((await staffLogin()).status, 401);

    const identity = {
      schoolRegistration: String(randomInt(10000000, 99999999)),
      birthDate: '2008-03-15',
      parentName: 'Filiação Fictícia da Produção',
    };
    const studentEmail = 'aluno-producao@eteconectada.invalid';
    const studentPassword = randomBytes(20).toString('base64url');
    await db.student.create({
      data: {
        fullName: 'Pessoa Estudante Fictícia',
        schoolRegistration: identity.schoolRegistration,
        birthDate: new Date(identity.birthDate),
        registrationAllowed: true,
        details: {
          create: {
            parentOne: identity.parentName,
            parentageSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    const check = await request('/api/registration/check', identity, null);
    assert.equal(check.status, 200);
    assert.deepEqual(await check.json(), { result: 'eligible' });
    // A etapa de envio do cadastro é exercitada com captura em test-registration-mail.
    const verificationToken = randomBytes(32).toString('base64url');
    await claimAccount({
      ...identity,
      birthDate: new Date(identity.birthDate),
      cpf: '52998224725',
      email: studentEmail,
      password: studentPassword,
      passwordHash: await hashPassword(studentPassword),
      tokenHash: createHash('sha256').update(verificationToken).digest('hex'),
    });
    const verify = await request(
      '/api/registration/verify',
      { token: verificationToken },
      null,
    );
    assert.equal(verify.status, 200);
    assert.deepEqual(await verify.json(), { result: 'verified' });
    const studentLogin = () =>
      request(
        '/api/login',
        { identifier: studentEmail, password: studentPassword },
        null,
      );
    const studentToken = await signedInToken(await studentLogin());
    assert.equal(
      (await request('/api/declaracao/solicitacoes', undefined, studentToken))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/secretaria/documentos/busca', {}, studentToken))
        .status,
      403,
    );
    assert.equal(
      (await request('/api/conta/senha', { desconhecido: true }, studentToken))
        .status,
      422,
    );
    assert.equal(
      connections,
      0,
      'O ensaio de produção não envia e-mail externo.',
    );
    await stop(enabled);
    delete env.PORTAL_ACCESS_MODE;
    await startSchool();
    assert.equal((await studentLogin()).status, 404);
    assert.equal((await request('/', undefined, studentToken)).status, 307);
    console.log(
      'Produção: convite, cadastro, sessão segura, separação de papéis, retirada e desligamento conferidos.',
    );
  } finally {
    controller.abort();
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
    try {
      if (child) await stop(child);
    } finally {
      try {
        await new Promise<void>((resolve, reject) =>
          sink.close((error) =>
            error &&
            (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
              ? reject(error)
              : resolve(),
          ),
        );
      } finally {
        await environment.close();
      }
    }
  }
}

main().catch(reportTestFailure);
