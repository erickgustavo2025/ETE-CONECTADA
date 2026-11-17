import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export class TestEnvironmentError extends Error {}
const fail = (message: string): never => {
  throw new TestEnvironmentError(message);
};

// Nenhuma consulta, importação de .env.local ou fallback para DATABASE_URL aqui.
export function parseTestEnvironment(env: Record<string, string | undefined>) {
  if (!['test', 'development'].includes(env.NODE_ENV ?? ''))
    fail('Informe NODE_ENV=test ou development.');
  if (env.ALLOW_TEST_DATABASE_WRITES !== 'true')
    fail('Escritas sintéticas exigem ALLOW_TEST_DATABASE_WRITES=true.');
  const database = env.TEST_DATABASE_NAME ?? '';
  const identity = env.TEST_DATABASE_ID ?? '';
  if (!/^ete_test_[a-z0-9_]+$/.test(database))
    fail(
      'TEST_DATABASE_NAME deve começar com ete_test_ e conter somente letras minúsculas, números e _.',
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identity,
    )
  )
    fail('TEST_DATABASE_ID deve ser um UUID do banco descartável.');
  let parsed: URL;
  try {
    parsed = new URL(env.TEST_DATABASE_URL ?? '');
  } catch {
    return fail('Informe uma TEST_DATABASE_URL válida.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    parsed.pathname !== `/${database}` ||
    parsed.search ||
    parsed.hash
  ) {
    fail(
      'TEST_DATABASE_URL deve apontar para o banco de teste em loopback, sem parâmetros extras.',
    );
  }
  if (env.TEST_BASE_URL)
    fail('TEST_BASE_URL não é aceito: o teste inicia seu próprio portal.');
  if (env.TEST_PDF_OUTPUT || env.TEST_BATCH_PDF_OUTPUT)
    fail(
      'PDFs de teste usam diretório temporário próprio, sem caminho externo.',
    );
  return { url: env.TEST_DATABASE_URL!, database, identity };
}

export function assertDatabaseIdentity(
  actual: { database: string; marker: string | null },
  expected: { database: string; identity: string },
) {
  if (
    actual.database !== expected.database ||
    actual.marker !== `ETE_CONECTADA_TEST:${expected.identity}`
  ) {
    fail(
      'Banco não identificado como o descartável esperado; nenhuma escrita autorizada.',
    );
  }
}

async function stopPortal(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const stopped = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  const signal = (value: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), 5000);
  try {
    await stopped;
  } finally {
    clearTimeout(timer);
  }
}

async function startPortal(signal: AbortSignal, publicOrigin?: string) {
  const cancelled = () =>
    new TestEnvironmentError('Execução sintética cancelada.');
  if (signal.aborted) throw cancelled();
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const assigned =
        typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(assigned)));
    });
  });
  if (signal.aborted) throw cancelled();
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        RESEND_API_KEY: '',
        EMAIL_FROM: '',
        PORTAL_PUBLIC_URL: publicOrigin ?? `http://127.0.0.1:${port}`,
        NEXT_PUBLIC_LAN_HOST: publicOrigin
          ? new URL(publicOrigin).hostname
          : '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // Não encaminha logs do servidor: podem conter configurações locais ou dados da requisição.
  const securityWarning =
    'Laboratório interrompido: atualize o Next.js antes de repetir a validação.';
  let warned = false;
  const observeSecurityWarning = (chunk: Buffer) => {
    if (
      !warned &&
      chunk
        .toString()
        .includes(
          'Your version of Next.js is affected by a known security vulnerability.',
        )
    ) {
      warned = true;
      console.error(securityWarning);
    }
  };
  child.stdout?.on('data', observeSecurityWarning);
  child.stderr?.on('data', observeSecurityWarning);
  child.stderr?.resume();
  try {
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () =>
          finish(
            new TestEnvironmentError(
              'Portal de teste não iniciou em 90 segundos.',
            ),
          ),
        90000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        child.stdout?.off('data', ready);
        child.off('error', failed);
        child.off('exit', exited);
        signal.removeEventListener('abort', aborted);
        child.stdout?.resume();
        if (error) reject(error);
        else resolve();
      };
      const ready = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-2048);
        if (/Ready in/.test(output)) finish();
      };
      const aborted = () => finish(cancelled());
      const failed = () =>
        finish(
          new TestEnvironmentError(
            'Não foi possível iniciar o portal de teste.',
          ),
        );
      const exited = () =>
        finish(
          new TestEnvironmentError(
            'Portal de teste encerrou antes de ficar pronto. Verifique se outro Next está rodando nesta pasta.',
          ),
        );
      child.stdout?.on('data', ready);
      child.once('error', failed);
      child.once('exit', exited);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
    return { base: `http://127.0.0.1:${port}`, child };
  } catch (error) {
    await stopPortal(child);
    throw error;
  }
}

export async function openTestEnvironment({
  http = false,
  publicOrigin,
}: {
  http?: boolean;
  publicOrigin?: string;
} = {}) {
  if (publicOrigin !== undefined) {
    let url: URL;
    try {
      url = new URL(publicOrigin);
    } catch {
      return fail(
        'Origem de laboratório exige HTTPS loopback e portal próprio.',
      );
    }
    if (
      !http ||
      url.origin !== publicOrigin ||
      url.protocol !== 'https:' ||
      !url.port ||
      !(
        ['127.0.0.1', 'localhost'].includes(url.hostname) ||
        /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost$/.test(url.hostname)
      )
    )
      fail('Origem de laboratório exige HTTPS loopback e portal próprio.');
  }
  const expected = parseTestEnvironment(process.env);
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: expected.url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const result = await client.query<{
      database: string;
      marker: string | null;
    }>(
      "SELECT current_database() AS database, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    );
    assertDatabaseIdentity(result.rows[0], expected);
  } catch (error) {
    if (error instanceof TestEnvironmentError) throw error;
    fail('Não foi possível conferir a identidade do banco de teste.');
  } finally {
    await client.end();
  }

  process.env.DATABASE_URL = expected.url;
  process.env.DIRECT_URL = expected.url;
  process.env.RESEND_API_KEY = '';
  process.env.EMAIL_FROM = '';
  const { getDb } = await import('../src/lib/db');
  const db = getDb();
  let portal: Awaited<ReturnType<typeof startPortal>> | undefined;
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  const close = async () => {
    closing ??= (async () => {
      controller.abort();
      process.off('SIGINT', interrupted);
      process.off('SIGTERM', interrupted);
      if (portal) await stopPortal(portal.child);
      // Apenas contadores técnicos gerados por este portal sintético, após encerrar HTTP.
      // A identidade do banco já foi conferida; test:cleanup continua somente leitura.
      if (portal) await db.accessAttemptBucket.deleteMany();
    })();
    // A limpeza de fixtures após um sinal pode reabrir Prisma; desconecta em toda chamada.
    try {
      await closing;
    } finally {
      await db.$disconnect();
    }
  };
  const interrupted = () => {
    void close().finally(() => {
      process.exitCode = 130;
    });
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    if (http) portal = await startPortal(controller.signal, publicOrigin);
    if (controller.signal.aborted) {
      if (portal) await stopPortal(portal.child);
      fail('Execução sintética cancelada.');
    }
    return { db, base: portal?.base ?? '', close };
  } catch (error) {
    await close();
    throw error;
  }
}

export function reportTestFailure(error: unknown) {
  const location =
    error instanceof Error
      ? error.stack
          ?.split('\n')
          .find((line) => /scripts\/test-[^/]+\.ts:\d+/.test(line))
          ?.trim()
      : undefined;
  console.error(
    error instanceof TestEnvironmentError
      ? error.message
      : 'Falha no teste sintético; confira as asserções e o ambiente descartável.',
    location ?? '',
  );
  process.exitCode ||= 1;
}
