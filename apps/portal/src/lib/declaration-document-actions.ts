import { Prisma } from '@/generated/prisma/client';
import { getDb } from './db';
import { declarationRegistryPreviewEnabled } from './declaration-documents';
import { DeclarationValidationError } from './declarations';
import { RequestError, validRequestId } from './declaration-requests';

export type DocumentActionInput = {
  documentId: string;
  action: 'CANCELLED' | 'SUPERSEDED';
  reason: string;
  successorId: string | null;
};
export function readDocumentAction(value: unknown): DocumentActionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DeclarationValidationError('Confira os dados da ação.');
  const body = value as Record<string, unknown>;
  if (!validRequestId(body.documentId))
    throw new DeclarationValidationError('Escolha uma minuta válida.');
  if (body.action !== 'CANCELLED' && body.action !== 'SUPERSEDED')
    throw new DeclarationValidationError('Escolha cancelar ou substituir.');
  if (body.confirmed !== true)
    throw new DeclarationValidationError(
      'Confirme a ação após conferir a minuta.',
      'confirmed',
    );
  const reason =
    typeof body.reason === 'string'
      ? body.reason.trim().replace(/\s+/g, ' ')
      : '';
  if (
    Array.from(reason).length < 3 ||
    Array.from(reason).length > 500 ||
    Array.from(reason).some((character) => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127;
    })
  )
    throw new DeclarationValidationError(
      'Explique o motivo usando de 3 a 500 caracteres.',
      'reason',
    );
  if (
    body.action === 'SUPERSEDED' &&
    (!validRequestId(body.successorId) ||
      body.successorId.toLowerCase() === body.documentId.toLowerCase())
  )
    throw new DeclarationValidationError(
      'Escolha outra minuta para substituir esta.',
      'successorId',
    );
  if (body.action === 'CANCELLED' && body.successorId != null)
    throw new DeclarationValidationError(
      'O cancelamento não usa uma minuta substituta.',
    );
  return {
    documentId: body.documentId.toLowerCase(),
    action: body.action,
    reason,
    successorId:
      body.action === 'SUPERSEDED'
        ? String(body.successorId).toLowerCase()
        : null,
  };
}

export async function changeDeclarationDocument(
  input: DocumentActionInput,
  accountId: string,
) {
  if (!declarationRegistryPreviewEnabled())
    throw new RequestError('Página não disponível.', 404);
  if (!validRequestId(accountId))
    throw new RequestError('Acesso não autorizado.', 403);
  return getDb().$transaction(async (tx) => {
    const actors = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM accounts WHERE id=${accountId}::uuid AND role='secretary' AND status='active' FOR UPDATE`;
    if (!actors.length)
      throw new RequestError(
        'Seu acesso à secretaria mudou. Entre novamente.',
        403,
      );
    const ids = [
      ...new Set([
        input.documentId,
        ...(input.successorId ? [input.successorId] : []),
      ]),
    ].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM declaration_documents WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    const rows = await tx.declarationDocument.findMany({
      where: { id: { in: ids } },
      include: { terminalActions: true, predecessorActions: true },
    });
    const original = rows.find((row) => row.id === input.documentId);
    if (!original)
      throw new RequestError('Minuta não encontrada. Atualize a lista.', 404);
    const previous = original.terminalActions[0];
    if (previous) {
      if (
        previous.action === input.action &&
        previous.reason === input.reason &&
        previous.successorId === input.successorId
      )
        return { created: false, action: previous };
      throw new RequestError(
        'Esta minuta já foi cancelada ou substituída. Atualize a lista.',
        409,
      );
    }
    if (input.successorId) {
      const successor = rows.find((row) => row.id === input.successorId);
      if (
        !successor ||
        successor.studentId !== original.studentId ||
        successor.enrollmentId !== original.enrollmentId
      )
        throw new RequestError(
          'A substituta precisa ser da mesma matrícula e do mesmo aluno.',
          422,
        );
      const period = (snapshot: Prisma.JsonValue) =>
        snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
          ? snapshot.periodLabel
          : undefined;
      if (
        !period(original.snapshot) ||
        period(original.snapshot) !== period(successor.snapshot)
      )
        throw new RequestError(
          'A substituta precisa ser do mesmo período letivo.',
          422,
        );
      if (
        successor.terminalActions.length ||
        successor.predecessorActions.length
      )
        throw new RequestError(
          'A minuta substituta já foi utilizada ou não está mais disponível.',
          409,
        );
    }
    const action = await tx.declarationDocumentAction.create({
      data: {
        ...input,
        studentId: original.studentId,
        enrollmentId: original.enrollmentId,
        createdById: accountId,
      },
    });
    return { created: true, action };
  });
}
