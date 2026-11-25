import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { findSessionRecord } from '../src/lib/session-record';
import { utcPostgresUrl } from '../src/lib/database-config';

config({ path: '.env.local', quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: utcPostgresUrl(
        process.env.DATABASE_URL,
        process.env.PGOPTIONS,
      ),
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 60000,
    }),
    log: [{ emit: 'event', level: 'query' }],
  });
  let queries = 0;
  db.$on('query', () => {
    queries++;
  });
  async function measure(label: string, run: () => Promise<unknown>) {
    queries = 0;
    const start = performance.now();
    await run();
    console.log(
      JSON.stringify({
        stage: label,
        milliseconds: Math.round(performance.now() - start),
        queries,
      }),
    );
  }
  try {
    await measure('first_connection_select_1', () => db.$queryRaw`SELECT 1`);
    for (let i = 1; i <= 3; i++) {
      await measure(`warm_select_1_${i}`, () => db.$queryRaw`SELECT 1`);
    }
    const sample = await db.account.findFirst({
      where: { status: 'active', role: 'student' },
      select: { email: true, student: { select: { cpf: true } } },
    });
    const cpf = sample?.student?.cpf;
    if (sample) {
      for (let i = 1; cpf && i <= 3; i++) {
        await measure(`account_lookup_cpf_${i}`, () =>
          db.account.findFirst({
            where: { status: 'active', role: 'student', student: { cpf } },
            select: { id: true, passwordHash: true },
          }),
        );
      }
      if (sample.email)
        await measure('account_lookup_email', () =>
          db.account.findFirst({
            where: {
              status: 'active',
              email: { equals: sample.email!, mode: 'insensitive' },
            },
            select: { id: true, passwordHash: true },
          }),
        );
    } else
      console.log('Nenhuma conta ativa para medir consulta por CPF/e-mail.');
    const encoded = await hashPassword('diagnostic-synthetic-password');
    for (let i = 1; i <= 3; i++) {
      await measure(`password_verification_${i}`, () =>
        verifyPassword('diagnostic-synthetic-password', encoded),
      );
    }
    const session = await db.session.findFirst({
      where: { expiresAt: { gt: new Date() }, account: { status: 'active' } },
      select: { tokenHash: true },
    });
    if (session) {
      for (let i = 1; i <= 3; i++) {
        await measure(`home_session_lookup_${i}`, () =>
          db.session.findFirst({
            where: {
              tokenHash: session.tokenHash,
              expiresAt: { gt: new Date() },
              account: { status: 'active' },
            },
            select: {
              account: {
                select: {
                  id: true,
                  email: true,
                  student: {
                    select: { id: true, fullName: true },
                  },
                },
              },
            },
          }),
        );
      }
      for (let i = 1; i <= 3; i++) {
        await measure(`home_session_single_query_${i}`, () =>
          findSessionRecord(db, session.tokenHash),
        );
      }
      const old = await db.session.findFirst({
        where: {
          tokenHash: session.tokenHash,
          expiresAt: { gt: new Date() },
          account: { status: 'active' },
        },
        select: {
          account: {
            select: {
              id: true,
              email: true,
              role: true,
              staffName: true,
              student: {
                select: { id: true, fullName: true },
              },
            },
          },
        },
      });
      const optimized = await findSessionRecord(db, session.tokenHash);
      if (
        !old ||
        !optimized ||
        optimized.accountId !== old.account.id ||
        optimized.studentId !==
          (old.account.role === 'student' ? old.account.student?.id : null) ||
        optimized.email !== old.account.email ||
        optimized.fullName !==
          (old.account.staffName ?? old.account.student?.fullName ?? null)
      ) {
        throw new Error('Resultado de sessão divergente.');
      }
      console.log(
        'Consulta otimizada retorna os mesmos dados da sessão existente.',
      );
    } else
      console.log(
        'Nenhuma sessão ativa para medir a consulta da página inicial.',
      );
    if (await findSessionRecord(db, 'diagnostic-nonexistent-session'))
      throw new Error('Sessão inexistente aceita.');
    console.log('Sessão inexistente rejeitada.');
    console.log('Medindo conexão após 11 segundos sem consultas...');
    await new Promise((resolve) => setTimeout(resolve, 11000));
    await measure('connection_after_11s_idle', () => db.$queryRaw`SELECT 1`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error('Diagnóstico falhou. Confira a conexão ao Neon.');
  process.exitCode = 1;
});
