import type { Prisma } from '../generated/prisma/client';
import { RequestError } from './request-error';

// Ordem compartilhada: conta antes de aluno. Emissão e bloqueio se serializam nestas linhas.
export async function lockStudentAccess(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const [student] = await tx.$queryRaw<
    Array<{ loginBlocked: boolean; issuanceBlocked: boolean }>
  >`
    SELECT login_blocked AS "loginBlocked", issuance_blocked AS "issuanceBlocked"
    FROM students WHERE id=${studentId}::uuid FOR UPDATE
  `;
  if (!student || student.loginBlocked)
    throw new RequestError(
      'Seu acesso está bloqueado. Procure a secretaria.',
      403,
    );
  return student;
}
export function requireIssuanceAccess(student: { issuanceBlocked: boolean }) {
  if (student.issuanceBlocked)
    throw new RequestError(
      'A emissão de novas declarações está bloqueada. Procure a secretaria.',
      403,
    );
}
