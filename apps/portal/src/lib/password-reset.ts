import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from './registration';
import { clearLoginAttempts } from './access-throttle';
import { invalidateAccountCredentials } from './account-change-auth';
import { hashPassword } from './password';
import {
  resetLifetimeMs,
  resetOrigin,
  resetProblem,
  type ResetProblem,
} from './password-reset-input';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const credentialHash = (account: {
  id: string;
  email: string | null;
  passwordHash: string | null;
}) => hash(JSON.stringify([account.id, account.email, account.passwordHash]));
export const isStaffIdentity = (
  account: Pick<Account, 'role' | 'studentId' | 'staffName'>,
) => account.role === 'secretary' && !account.studentId && !!account.staffName;

function canRecoverAccount(account: Account) {
  return (
    account.status === 'active' &&
    !!account.email &&
    !!account.passwordHash &&
    (process.env.NODE_ENV !== 'production' ||
      account.role === 'student' ||
      isStaffIdentity(account))
  );
}

function pendingStaffInvite(account: Account) {
  return (
    isStaffIdentity(account) &&
    account.status === 'pending' &&
    account.email !== null &&
    account.passwordHash === null
  );
}

function staffInviteStamp(account: Account) {
  return hash(JSON.stringify(['staff-invite', account.id, account.email]));
}

function confirmsCredential(account: Account, stamp: string) {
  if (pendingStaffInvite(account)) return stamp === staffInviteStamp(account);
  return canRecoverAccount(account) && stamp === credentialHash(account);
}

export function newStaffInvite(account: Account) {
  if (!pendingStaffInvite(account))
    throw new Error('Conta não elegível para convite.');
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    record: {
      tokenHash: hash(token),
      accountId: account.id,
      credentialHash: staffInviteStamp(account),
      expiresAt: new Date(Date.now() + resetLifetimeMs),
    },
  };
}

export class PasswordResetError extends Error {
  constructor(public readonly reason: ResetProblem) {
    super(reason);
  }
}
export type RecoveryDelivery = {
  origin: string;
  send(to: string, url: string): Promise<void>;
};

export async function requestPasswordReset(
  db: PrismaClient,
  value: unknown,
  delivery: RecoveryDelivery,
) {
  const email = normalizeEmail(value),
    origin = resetOrigin(delivery.origin);
  if (!email || !origin) return;
  // Uma eventual duplicidade antiga por caixa do e-mail exige atendimento, não escolha arbitrária.
  const matches = await db.account.findMany({
    where: { status: 'active', email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  });
  if (matches.length !== 1) return;
  const pending = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${matches[0].id}::uuid FOR UPDATE`;
      const account = await tx.account.findUnique({
        where: { id: matches[0].id },
      });
      if (
        !account ||
        !canRecoverAccount(account) ||
        !account.email ||
        normalizeEmail(account.email) !== email
      )
        return null;
      const now = new Date(),
        stamp = credentialHash(account);
      await tx.passwordResetToken.deleteMany({
        where: {
          accountId: account.id,
          OR: [{ expiresAt: { lte: now } }, { credentialHash: { not: stamp } }],
        },
      });
      const recent = await tx.passwordResetToken.findFirst({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
      });
      if (recent && recent.createdAt.getTime() > now.getTime() - 60_000)
        return null;
      if (
        (await tx.passwordResetToken.count({
          where: { accountId: account.id },
        })) >= 3
      )
        return null;
      const token = randomBytes(32).toString('base64url');
      await tx.passwordResetToken.create({
        data: {
          tokenHash: hash(token),
          accountId: account.id,
          credentialHash: stamp,
          createdAt: now,
          expiresAt: new Date(now.getTime() + resetLifetimeMs),
        },
      });
      return {
        to: account.email,
        url: `${origin}/redefinir-senha#token=${token}`,
      };
    },
    { maxWait: 15000, timeout: 15000 },
  );
  // Sem link/resultado de existência no retorno público; transporte substituído apenas nos testes.
  if (pending) await delivery.send(pending.to, pending.url);
}

export async function completePasswordReset(
  db: PrismaClient,
  input: { token: unknown; password: unknown; confirmPassword: unknown },
) {
  const problem = resetProblem(input);
  if (problem) throw new PasswordResetError(problem);
  const tokenHash = hash(input.token as string);
  const preview = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { account: true },
  });
  if (
    !preview ||
    preview.expiresAt <= new Date() ||
    !confirmsCredential(preview.account, preview.credentialHash)
  )
    throw new PasswordResetError('invalid');
  const passwordHash = await hashPassword(input.password as string);
  return db.$transaction(
    async (tx) => {
      // Mesmo lock da emissão de sessão: login com senha antiga não sobrevive ao reset.
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${preview.accountId}::uuid FOR UPDATE`;
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { account: true },
      });
      const now = new Date();
      if (
        !token ||
        token.expiresAt <= now ||
        !token.account.email ||
        !confirmsCredential(token.account, token.credentialHash)
      )
        throw new PasswordResetError('invalid');
      await tx.account.update({
        where: { id: token.accountId },
        data: {
          passwordHash,
          status: 'active',
          updatedAt: now,
          ...(token.account.status === 'active'
            ? { passwordResetAt: now }
            : {}),
        },
      });
      await invalidateAccountCredentials(tx, token.accountId);
      const student = token.account.studentId
        ? await tx.student.findUniqueOrThrow({
            where: { id: token.account.studentId },
            select: { cpf: true },
          })
        : null;
      await clearLoginAttempts(tx, {
        id: token.accountId,
        email: token.account.email,
        cpf: student?.cpf ?? null,
      });
      return { email: token.account.email };
    },
    { maxWait: 15000, timeout: 15000 },
  );
}
