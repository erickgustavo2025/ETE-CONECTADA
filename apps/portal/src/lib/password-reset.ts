import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';
import { normalizeEmail } from './registration';
import { clearLoginAttempts } from './access-throttle';
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
        account.status !== 'active' ||
        !account.email ||
        !account.passwordHash ||
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
    preview.account.status !== 'active' ||
    preview.credentialHash !== credentialHash(preview.account)
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
        token.account.status !== 'active' ||
        !token.account.email ||
        token.credentialHash !== credentialHash(token.account)
      )
        throw new PasswordResetError('invalid');
      await tx.account.update({
        where: { id: token.accountId },
        data: { passwordHash, updatedAt: now, passwordResetAt: now },
      });
      await tx.session.deleteMany({ where: { accountId: token.accountId } });
      await tx.emailVerificationToken.deleteMany({
        where: { accountId: token.accountId },
      });
      await tx.passwordResetToken.deleteMany({
        where: { accountId: token.accountId },
      });
      const student = await tx.student.findUniqueOrThrow({
        where: { id: token.account.studentId },
        select: { cpf: true },
      });
      await clearLoginAttempts(tx, {
        id: token.accountId,
        email: token.account.email,
        cpf: student.cpf,
      });
      return { email: token.account.email };
    },
    { maxWait: 15000, timeout: 15000 },
  );
}
