import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { verifyPassword } from './password';
import { findSessionRecord, type SessionRecord } from './session-record';

type Credential = { session: SessionRecord; passwordHash: string };
export type AccountChangeProblem =
  'session' | 'password' | 'same' | 'format' | 'link' | 'staff-email';
export class AccountChangeError extends Error {
  constructor(public readonly reason: AccountChangeProblem) {
    super(reason);
  }
}

export async function accountChangeCredential(
  db: PrismaClient,
  sessionHash: string,
): Promise<Credential> {
  const session = await findSessionRecord(db, sessionHash);
  if (!session) throw new AccountChangeError('session');
  const account = await db.account.findUnique({
    where: { id: session.accountId },
    select: { passwordHash: true },
  });
  if (!account?.passwordHash) throw new AccountChangeError('session');
  return { session, passwordHash: account.passwordHash };
}

export async function confirmCurrentPassword(
  db: PrismaClient,
  sessionHash: string,
  password: string,
) {
  const credential = await accountChangeCredential(db, sessionHash);
  if (!(await verifyPassword(password, credential.passwordHash)))
    throw new AccountChangeError('password');
  return credential;
}

export async function lockAccountChange(
  tx: Prisma.TransactionClient,
  credential: Credential,
  sessionHash: string,
) {
  const { session, passwordHash } = credential;
  const [account] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM accounts
    WHERE id=${session.accountId}::uuid AND status='active'
      AND email=${session.email} AND password_hash=${passwordHash}
    FOR UPDATE
  `;
  if (!account) throw new AccountChangeError('session');
  // A ordem conta, aluno e sessão é a mesma empregada pelo bloqueio de login.
  if (session.role === 'student')
    await tx.$queryRaw`SELECT id FROM students WHERE id=${session.studentId}::uuid FOR SHARE`;
  const [active] = await tx.$queryRaw<{ token_hash: string }[]>`
    SELECT token_hash FROM sessions
    WHERE token_hash=${sessionHash} AND account_id=${account.id}::uuid
      AND expires_at > clock_timestamp()
    FOR UPDATE
  `;
  if (!active || !(await findSessionRecord(tx, sessionHash)))
    throw new AccountChangeError('session');
}

export async function invalidateAccountCredentials(
  tx: Prisma.TransactionClient,
  accountId: string,
) {
  await tx.session.deleteMany({ where: { accountId } });
  await tx.emailVerificationToken.deleteMany({ where: { accountId } });
  await tx.passwordResetToken.deleteMany({ where: { accountId } });
  await tx.accountEmailChange.deleteMany({ where: { accountId } });
}
