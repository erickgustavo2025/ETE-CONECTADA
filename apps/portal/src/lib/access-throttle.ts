import { createHmac } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

export const accessPolicies = {
  login: { limit: 10, windowMs: 5 * 60_000 },
  registration: { limit: 20, windowMs: 15 * 60_000 },
  'login-account': { limit: 10, windowMs: 5 * 60_000 },
} as const;
const globalPolicy = { limit: 600, windowMs: 60_000 };
export const accessBucketCapacity = 20_000;
export type AccessAction = keyof typeof accessPolicies;
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; retryAfter: number };
type Transaction = Prisma.TransactionClient;
type State = { keyMaterial: string; lastSweepMs: number };

async function lockState(tx: Transaction) {
  const rows = await tx.$queryRaw<State[]>`
    SELECT key_material AS "keyMaterial",
           (extract(epoch from last_sweep_at) * 1000)::double precision AS "lastSweepMs"
    FROM access_throttle_state WHERE id = 1 FOR UPDATE
  `;
  if (rows.length !== 1 || !/^[a-f0-9]{64}$/.test(rows[0].keyMaterial))
    throw new Error('Controle de tentativas indisponível.');
  return rows[0];
}
const fingerprint = (state: State, action: string, identifier: string) =>
  createHmac('sha256', Buffer.from(state.keyMaterial, 'hex'))
    .update(JSON.stringify([action, identifier]))
    .digest('hex');
const blocked = (milliseconds: number): AccessDecision => ({
  allowed: false,
  retryAfter: Math.max(1, Math.ceil(milliseconds / 1000)),
});

async function consumeBucket(
  tx: Transaction,
  key: string,
  policy: { limit: number; windowMs: number },
  nowMs: number,
): Promise<AccessDecision> {
  const [row] = await tx.$queryRaw<Array<{ used: number; expiresMs: number }>>`
    SELECT used, (extract(epoch from expires_at) * 1000)::double precision AS "expiresMs"
    FROM access_attempt_buckets WHERE key = ${key}
  `;
  if (row && row.expiresMs > nowMs) {
    if (row.used >= policy.limit) return blocked(row.expiresMs - nowMs);
    await tx.accessAttemptBucket.update({
      where: { key },
      data: { used: { increment: 1 } },
    });
    return { allowed: true };
  }
  // Limita também a quantidade de identificadores inventados; não cresce sem limite.
  if (!row && (await tx.accessAttemptBucket.count()) >= accessBucketCapacity)
    return blocked(globalPolicy.windowMs);
  await tx.$executeRaw`
    INSERT INTO access_attempt_buckets (key, used, window_started_at, expires_at)
    VALUES (${key}, 1, to_timestamp(${nowMs}::double precision / 1000),
      to_timestamp(${nowMs + policy.windowMs}::double precision / 1000))
    ON CONFLICT (key) DO UPDATE SET used = 1,
      window_started_at = EXCLUDED.window_started_at, expires_at = EXCLUDED.expires_at
  `;
  return { allowed: true };
}

// O lock persistente serializa somente a admissão; nunca inclui scrypt, e-mail ou HTTP.
// O relógio é do PostgreSQL e o contador é compartilhado entre processos/reinícios.
export async function consumeAccessAttempt(
  db: PrismaClient,
  action: AccessAction,
  identifier: string,
): Promise<AccessDecision> {
  return db.$transaction(
    async (tx) => {
      const state = await lockState(tx);
      // Epoch evita depender da representação de TIMESTAMPTZ/fuso no driver.
      const [clock] = await tx.$queryRaw<Array<{ nowMs: number }>>`
        SELECT floor(extract(epoch from clock_timestamp()) * 1000)::double precision AS "nowMs"
      `;
      const nowMs = clock.nowMs;
      if (nowMs - state.lastSweepMs >= 60_000) {
        await tx.$executeRaw`DELETE FROM access_attempt_buckets
          WHERE expires_at <= to_timestamp(${nowMs}::double precision / 1000)`;
        await tx.$executeRaw`UPDATE access_throttle_state
          SET last_sweep_at = to_timestamp(${nowMs}::double precision / 1000) WHERE id = 1`;
      }
      // A entrada HTTP já consumiu o orçamento global antes da consulta da conta.
      if (action !== 'login-account') {
        const global = await consumeBucket(
          tx,
          fingerprint(state, 'global', ''),
          globalPolicy,
          nowMs,
        );
        if (!global.allowed) return global;
      }
      return consumeBucket(
        tx,
        fingerprint(state, action, identifier),
        accessPolicies[action],
        nowMs,
      );
    },
    { maxWait: 3000, timeout: 5000 },
  );
}

export function accessLimitResponse(decision: AccessDecision): Response | null {
  return decision.allowed
    ? null
    : Response.json(
        {
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(decision.retryAfter),
            'Cache-Control': 'no-store',
          },
        },
      );
}

export async function clearLoginAttempts(
  tx: Transaction,
  account: { id: string; email: string | null; cpf: string | null },
) {
  const state = await lockState(tx);
  const keys = [fingerprint(state, 'login-account', account.id)];
  if (account.email)
    keys.push(fingerprint(state, 'login', account.email.trim().toLowerCase()));
  if (account.cpf)
    keys.push(fingerprint(state, 'login', account.cpf.replace(/\D/g, '')));
  // Autenticação ou recuperação já conferida; mantém o orçamento global contra abuso.
  await tx.accessAttemptBucket.deleteMany({ where: { key: { in: keys } } });
}
