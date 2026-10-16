import type { PrismaClient } from '../generated/prisma/client';

export type SessionRecord = {
  accountId: string;
  studentId: string;
  email: string;
  fullName: string | null;
  role: 'student' | 'secretary';
};

// Reconfere sob o mesmo lock do reset. Uma senha verificada antes da troca não cria sessão depois dela.
export async function createVerifiedSession(
  db: PrismaClient,
  accountId: string,
  passwordHash: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return db.$transaction(
    async (tx) => {
      const current = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM accounts WHERE id = ${accountId}::uuid
      AND status = 'active' AND password_hash = ${passwordHash} FOR UPDATE
    `;
      if (!current.length) return false;
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
      AND a.email IS NOT NULL AND a.email <> ''
    LIMIT 1
  `;
  return rows[0] ?? null;
}
