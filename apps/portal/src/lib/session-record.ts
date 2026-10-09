import type { PrismaClient } from "../generated/prisma/client";

export type SessionRecord = {
  accountId: string;
  studentId: string;
  email: string;
  fullName: string | null;
  role: "student" | "secretary";
};

// Uma única ida ao banco, sem carregar dados de senha.
export async function findSessionRecord(
  db: Pick<PrismaClient, "$queryRaw">,
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
