import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { DeclarationValidationError } from "./declarations";
import type { RequestSummary } from "./declaration-request-types";

export const requestSummarySelect = {
  id: true,
  status: true,
  createdAt: true,
  generatedAt: true,
  readyAt: true,
  enrollmentId: true,
  enrollment: { select: { className: true } },
} satisfies Prisma.DeclarationRequestSelect;
export function requestSummary(
  row: Prisma.DeclarationRequestGetPayload<{
    select: typeof requestSummarySelect;
  }>,
): RequestSummary {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    enrollmentId: row.enrollmentId,
    className: row.enrollment.className,
  };
}
export async function studentRequests(studentId: string) {
  return (
    await getDb().declarationRequest.findMany({
      where: { studentId },
      select: requestSummarySelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  ).map(requestSummary);
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requestDeclaration(
  studentId: string,
  enrollmentId: string,
) {
  return getDb().$transaction(
    async (tx) => {
      // Serializa cliques repetidos; o índice parcial também protege chamadas concorrentes.
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
      const enrollment = await tx.enrollment.findFirst({
        where: { id: enrollmentId, studentId },
        select: { mode: true },
      });
      if (!enrollment)
        throw new RequestError(
          "Matrícula não encontrada na sua conta. Procure a secretaria.",
          422,
        );
      if (enrollment.mode !== "INTEGRADO")
        throw new RequestError(
          "O atendimento do subsequente aguarda a confirmação do modelo pela escola.",
          422,
        );
      const existing = await tx.declarationRequest.findFirst({
        where: { enrollmentId, status: { not: "READY_FOR_PICKUP" } },
        select: requestSummarySelect,
      });
      if (existing)
        return { request: requestSummary(existing), created: false };
      const row = await tx.declarationRequest.create({
        data: { studentId, enrollmentId },
        select: requestSummarySelect,
      });
      return { request: requestSummary(row), created: true };
    },
    { timeout: 15000 },
  );
}

// Só uma geração bem-sucedida, com os dados conferidos, inicia a preparação.
// Não grava os dados pessoais digitados no editor e não anuncia retirada.
export async function recordGeneratedDeclarations(
  items: { studentId: string; enrollmentId: string }[],
  accountId: string,
) {
  await getDb().$transaction(async (tx) => {
    await tx.declarationRequest.updateMany({
      where: {
        status: "REQUESTED",
        OR: items.map((item) => ({
          studentId: item.studentId,
          enrollmentId: item.enrollmentId,
        })),
      },
      data: {
        status: "IN_PREPARATION",
        generatedAt: new Date(),
        preparedById: accountId,
      },
    });
  });
}
export async function markReadyForPickup(id: string, accountId: string) {
  return getDb().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM declaration_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.declarationRequest.findUnique({
        where: { id },
        select: requestSummarySelect,
      });
      if (!row)
        throw new RequestError(
          "Solicitação não encontrada. Atualize a lista.",
          404,
        );
      if (row.status === "READY_FOR_PICKUP") return requestSummary(row);
      if (row.status !== "IN_PREPARATION")
        throw new RequestError(
          "Gere o PDF e prepare o documento antes de liberar a retirada.",
          409,
        );
      return requestSummary(
        await tx.declarationRequest.update({
          where: { id },
          data: {
            status: "READY_FOR_PICKUP",
            readyAt: new Date(),
            readyById: accountId,
          },
          select: requestSummarySelect,
        }),
      );
    },
    { timeout: 15000 },
  );
}
export function validRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function requestFailure(error: unknown) {
  if (error instanceof RequestError)
    return { error: error.message, status: error.status };
  if (error instanceof DeclarationValidationError)
    return { error: error.message, status: 422 };
  return {
    error:
      "Não foi possível concluir. Seus dados foram preservados; tente novamente.",
    status: 503,
  };
}
