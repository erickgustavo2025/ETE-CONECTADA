import type { PrismaClient } from '../generated/prisma/client';

export type SessionRecord = {
  accountId: string;
  studentId: string;
  email: string;
  fullName: string | null;
  role: 'student' | 'secretary';
};

// Reconfere o mesmo e-mail e a mesma senha sob o lock das alterações da conta.
export async function createVerifiedSession(
  db: PrismaClient,
  accountId: string,
  passwordHash: string,
  email: string | null,
  tokenHash: string,
  expiresAt: Date,
) {
  return db.$transaction(
    async (tx) => {
      const current = await tx.$queryRaw<
        Array<{ id: string; studentId: string; role: string }>
      >`
      SELECT id, student_id AS "studentId", role FROM accounts WHERE id = ${accountId}::uuid
      AND status = 'active' AND password_hash = ${passwordHash}
      AND email IS NOT DISTINCT FROM ${email}::text FOR UPDATE
    `;
      if (!current.length) return false;
      if (current[0].role === 'student') {
        const allowed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM students WHERE id=${current[0].studentId}::uuid AND NOT login_blocked FOR SHARE
        `;
        if (!allowed.length) return false;
      }
      await tx.session.create({ data: { accountId, tokenHash, expiresAt } });
      return true;
    },
    { maxWait: 15000, timeout: 15000 },
  );
}

// Uma única ida ao banco, sem carregar dados de senha.
export async function findSessionRecord(
  db: Pick<PrismaClient, '$queryRaw'>,
  tokenHash: string,
): Promise<SessionRecord | null> {
  const rows = await db.$queryRaw<SessionRecord[]>`
    SELECT a.id AS "accountId", s.id AS "studentId", a.email, a.role,
           s.full_name AS "fullName"
    FROM sessions se
    JOIN accounts a ON a.id = se.account_id
    JOIN students s ON s.id = a.student_id
    WHERE se.token_hash = ${tokenHash}
      AND se.expires_at > ${new Date()}
      AND a.status = 'active'
      AND (a.role <> 'student' OR NOT s.login_blocked)
      AND a.email IS NOT NULL AND a.email <> ''
    LIMIT 1
  `;
  return rows[0] ?? null;
}
