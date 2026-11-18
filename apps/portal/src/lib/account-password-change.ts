import type { PrismaClient } from '../generated/prisma/client';
import { validAccessPassword } from './access-input';
import { hashPassword } from './password';
import {
  AccountChangeError,
  confirmCurrentPassword,
  invalidateAccountCredentials,
  lockAccountChange,
} from './account-change-auth';

type PasswordChange = {
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
};

export async function changeAccountPassword(
  db: PrismaClient,
  sessionHash: string,
  input: PasswordChange,
) {
  const { currentPassword, newPassword, confirmPassword } = input;
  if (
    !validAccessPassword(currentPassword) ||
    !validAccessPassword(newPassword) ||
    newPassword !== confirmPassword
  )
    throw new AccountChangeError('format');

  const credential = await confirmCurrentPassword(
    db,
    sessionHash,
    currentPassword,
  );
  if (newPassword === currentPassword) throw new AccountChangeError('same');
  const passwordHash = await hashPassword(newPassword);
  const { accountId, email } = credential.session;

  return db.$transaction(
    async (tx) => {
      await lockAccountChange(tx, credential, sessionHash);
      const now = new Date();
      await tx.account.update({
        where: { id: accountId },
        data: { passwordHash, updatedAt: now, passwordResetAt: now },
      });
      await invalidateAccountCredentials(tx, accountId);
      await tx.accountSecurityEvent.create({
        data: { accountId, action: 'PASSWORD_CHANGED' },
      });
      return { email };
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}
