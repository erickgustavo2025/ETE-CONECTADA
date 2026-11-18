import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  createServer as createPlainServer,
  type Server,
  type Socket,
} from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  createSecureContext,
  createServer as createTlsServer,
  TLSSocket,
} from 'node:tls';
import { promisify } from 'node:util';
import { reportTestFailure } from './test-environment';

const exec = promisify(execFile);
const user = 'smtp-fixture-user';
const pass = 'smtp-fixture-password';
const to = 'aluno@example.invalid';

async function bind(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

function exchange(
  socket: Socket,
  tls: boolean,
  record: (command: string) => void,
  upgrade?: (socket: Socket) => void,
  greet = true,
) {
  socket.setTimeout(8000, () => socket.destroy());
  socket.on('error', () => socket.destroy());
  const lineReader = createInterface({ input: socket });
  if (greet) socket.write('220 SMTP de ensaio\r\n');
  let receiving = false;
  let authenticated = false;
  lineReader.on('line', (line) => {
    if (receiving) {
      if (line === '.') {
        receiving = false;
        record('EMAIL');
        socket.write('250 aceito\r\n');
      }
      return;
    }

    const command = line.split(' ', 1)[0].toUpperCase();
    record(command);
    switch (command) {
      case 'EHLO':
        socket.write(
          tls
            ? '250-smtp.fixture\r\n250 AUTH PLAIN\r\n'
            : '250 smtp.fixture\r\n',
        );
        break;
      case 'STARTTLS':
        if (!upgrade) {
          socket.write('454 TLS indisponível\r\n');
          break;
        }
        lineReader.close();
        socket.write('220 preparando TLS\r\n', () => upgrade(socket));
        break;
      case 'AUTH':
        authenticated =
          tls &&
          Buffer.from(line.split(' ')[2] || '', 'base64').toString() ===
            ['', user, pass].join('\0');
        socket.write(
          authenticated ? '235 autenticado\r\n' : '535 recusado\r\n',
        );
        break;
      case 'MAIL':
      case 'RCPT':
        socket.write(
          authenticated ? '250 aceito\r\n' : '530 autenticação obrigatória\r\n',
        );
        break;
      case 'DATA':
        receiving = authenticated;
        socket.write(
          receiving
            ? '354 enviar mensagem\r\n'
            : '530 autenticação obrigatória\r\n',
        );
        break;
      case 'QUIT':
        socket.end('221 fim\r\n');
        break;
      default:
        socket.write('454 indisponível\r\n');
    }
  });
}

async function run(
  port: number,
  tlsMode: 'implicit' | 'starttls',
  expected: 'sent' | 'failed',
  certificate?: string,
) {
  // Processo separado permite confiar no certificado fictício sem relaxar TLS no produto.
  const script = `
    const assert = require('node:assert/strict');
    const { verificationDelivery } = require('./src/lib/verification-delivery.ts');
    const { recoveryMailer } = require('./src/lib/recovery-mail.ts');
    const { MailDeliveryError } = require('./src/lib/email-transport.ts');
    const { accountEmailMailer } = require('./src/lib/account-email-mail.ts');
    (async () => {
      const verification = verificationDelivery('A'.repeat(43));
      const recovery = recoveryMailer();
      assert.ok(verification && recovery);
      const recipient = process.env.SMTP_FIXTURE_TO;
      if (process.env.SMTP_FIXTURE_EXPECT === 'failed') {
        await assert.rejects(verification.send(recipient), (error) =>
          error instanceof MailDeliveryError && error.cause === undefined
        );
        return;
      }
      assert.deepEqual(await verification.send(recipient), { result: 'email_sent' });
      await recovery.send(recipient, 'https://portal.example.invalid/redefinir-senha#token=fixture');
      const account = accountEmailMailer();
      assert.ok(account);
      await account.confirmation(recipient, 'https://portal.example.invalid/confirmar-novo-email#token=fixture');
      await account.notify('antes@example.invalid');
      await account.notify(recipient);
    })().catch(() => { process.exitCode = 1; });
  `;
  await exec(process.execPath, ['--import', 'tsx', '-e', script], {
    env: {
      NODE_ENV: 'test',
      EMAIL_TRANSPORT: 'smtp',
      PORTAL_PUBLIC_URL: 'https://portal.example.invalid',
      EMAIL_FROM: 'ETE <secretaria@example.invalid>',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(port),
      SMTP_TLS_MODE: tlsMode,
      SMTP_USER: user,
      SMTP_PASSWORD: pass,
      SMTP_FIXTURE_EXPECT: expected,
      SMTP_FIXTURE_TO: to,
      ...(certificate ? { NODE_EXTRA_CA_CERTS: certificate } : {}),
    },
    timeout: 18_000,
  });
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'ete-smtp-'));
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const track = (
    socket: Socket,
    tls: boolean,
    upgrade?: (socket: Socket) => void,
    greet = true,
  ) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    exchange(socket, tls, (command) => commands.push(command), upgrade, greet);
  };
  let secure: Server | undefined;
  let starttls: Server | undefined;
  let plain: Server | undefined;
  try {
    const cert = join(work, 'certificate.pem');
    const key = join(work, 'private.pem');
    await exec('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-noenc',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      key,
      '-out',
      cert,
    ]);
    const options = {
      cert: await readFile(cert),
      key: await readFile(key),
      minVersion: 'TLSv1.2' as const,
    };
    secure = createTlsServer(options, (socket) => track(socket, true));
    const port = await bind(secure);
    await run(port, 'implicit', 'sent', cert);
    assert.equal(commands.filter((command) => command === 'EMAIL').length, 5);
    assert.equal(commands.filter((command) => command === 'AUTH').length, 5);

    commands.length = 0;
    await run(port, 'implicit', 'failed');
    assert.equal(commands.length, 0);

    const secureContext = createSecureContext(options);
    starttls = createPlainServer((socket) => {
      track(socket, false, (connection) => {
        const encrypted = new TLSSocket(connection, {
          isServer: true,
          secureContext,
        });
        track(encrypted, true, undefined, false);
      });
    });
    await run(await bind(starttls), 'starttls', 'sent', cert);
    assert.equal(
      commands.filter((command) => command === 'STARTTLS').length,
      5,
    );
    assert.equal(commands.filter((command) => command === 'EMAIL').length, 5);
    assert.ok(commands.indexOf('STARTTLS') < commands.indexOf('AUTH'));

    commands.length = 0;
    plain = createPlainServer((socket) => track(socket, false));
    await run(await bind(plain), 'starttls', 'failed', cert);
    assert.ok(commands.includes('EHLO'));
    assert.equal(
      commands.some((command) =>
        ['AUTH', 'MAIL', 'RCPT', 'EMAIL'].includes(command),
      ),
      false,
    );
    console.log(
      'OK: cadastro e recuperação por SMTP/TLS em loopback, certificado recusado e STARTTLS obrigatório sem envio em texto aberto.',
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await secure?.[Symbol.asyncDispose]();
    await starttls?.[Symbol.asyncDispose]();
    await plain?.[Symbol.asyncDispose]();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch(reportTestFailure);
