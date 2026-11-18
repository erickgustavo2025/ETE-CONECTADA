import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { validAccessPassword } from './access-input';
import {
  AccountChangeError,
  accountChangeCredential,
  confirmCurrentPassword,
  invalidateAccountCredentials,
  lockAccountChange,
} from './account-change-auth';
import { resetLifetimeMs, validResetToken } from './password-reset-input';
import { configuredOrigin } from './portal-origin';
import { normalizeEmail } from './registration';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const stamp = (
  credential: Awaited<ReturnType<typeof accountChangeCredential>>,
) =>
  digest(
    JSON.stringify([
      credential.session.accountId,
      credential.session.email,
      credential.passwordHash,
    ]),
  );

export async function requestAccountEmailChange(
  db: PrismaClient,
  sessionHash: string,
  input: { currentPassword: unknown; newEmail: unknown },
  portalOrigin: string,
) {
  const email = normalizeEmail(input.newEmail);
  const origin = configuredOrigin(portalOrigin);
  if (
    !validAccessPassword(input.currentPassword) ||
    !email ||
    /[<>,;"()[\]\\]/u.test(email) ||
    !origin
  )
    throw new AccountChangeError('format');
  const credential = await confirmCurrentPassword(
    db,
    sessionHash,
    input.currentPassword,
  );
  if (email === normalizeEmail(credential.session.email))
    throw new AccountChangeError('same');
  const { accountId } = credential.session;
  const token = randomBytes(32).toString('base64url');
  const fields = {
    newEmail: email,
    tokenHash: digest(token),
    credentialHash: stamp(credential),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + resetLifetimeMs),
  };
  return db.$transaction(
    async (tx) => {
      await lockAccountChange(tx, credential, sessionHash);
      const alreadyInUse = await tx.account.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (alreadyInUse) return null;
      await tx.accountEmailChange.upsert({
        where: { accountId },
        create: { accountId, ...fields },
        update: fields,
      });
      return {
        email,
        confirmationLink: `${origin}/confirmar-novo-email#token=${token}`,
      };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}

export async function confirmAccountEmailChange(
  db: PrismaClient,
  sessionHash: string,
  token: unknown,
) {
  if (!validResetToken(token)) throw new AccountChangeError('link');
  const credential = await accountChangeCredential(db, sessionHash);
  const { accountId, email: previousEmail } = credential.session;
  try {
    return await db.$transaction(
      async (tx) => {
        await lockAccountChange(tx, credential, sessionHash);
        const pending = await tx.accountEmailChange.findUnique({
          where: { accountId },
        });
        if (
          !pending ||
          pending.expiresAt <= new Date() ||
          pending.tokenHash !== digest(token) ||
          pending.credentialHash !== stamp(credential)
        )
          throw new AccountChangeError('link');

        const occupied = await tx.account.findFirst({
          where: {
            id: { not: accountId },
            email: { equals: pending.newEmail, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (occupied) throw new AccountChangeError('link');
        const { newEmail } = pending;
        await tx.account.update({
          where: { id: accountId },
          data: { email: newEmail, updatedAt: new Date() },
        });
        await invalidateAccountCredentials(tx, accountId);
        await tx.accountSecurityEvent.create({
          data: { accountId, action: 'EMAIL_CHANGED' },
        });
        return { previousEmail, newEmail };
      },
      { maxWait: 15_000, timeout: 15_000 },
    );
  } catch (error) {
    // Dois titulares podem disputar o mesmo endereço. O índice único decide a corrida.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new AccountChangeError('link');
    throw error;
  }
}
