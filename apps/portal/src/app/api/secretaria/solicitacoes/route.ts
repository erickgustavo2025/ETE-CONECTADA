import { currentSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { canManageDeclarations } from "@/lib/declaration-access";
import { studentDeclarationSelect, studentView } from "@/lib/declarations";
import {
  markReadyForPickup,
  requestFailure,
  requestSummary,
  requestSummarySelect,
  validRequestId,
} from "@/lib/declaration-requests";
import { privateHeaders, sameOriginRequest } from "@/lib/private-request";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: "Entre novamente para continuar." },
        { status: 401, headers: privateHeaders },
      );
    if (!canManageDeclarations(session.role))
      return Response.json(
        { error: "Sua conta não tem acesso ao atendimento de solicitações." },
        { status: 403, headers: privateHeaders },
      );
    const params = new URL(request.url).searchParams;
    const filter = params.get("status") ?? "OPEN";
    if (
      !["OPEN", "REQUESTED", "IN_PREPARATION", "READY_FOR_PICKUP"].includes(
        filter,
      )
    )
      return Response.json(
        { error: "Escolha um status válido." },
        { status: 400, headers: privateHeaders },
      );
    const pageInput = Number(params.get("page") ?? 1);
    if (!Number.isSafeInteger(pageInput) || pageInput < 1)
      return Response.json(
        { error: "Página inválida." },
        { status: 400, headers: privateHeaders },
      );
    const where =
      filter === "OPEN"
        ? { status: { not: "READY_FOR_PICKUP" as const } }
        : {
            status: filter as
              | "REQUESTED"
              | "IN_PREPARATION"
              | "READY_FOR_PICKUP",
          };
    const db = getDb();
    const total = await db.declarationRequest.count({ where });
    const page = Math.min(pageInput, Math.max(1, Math.ceil(total / 20)));
    const rows = await db.declarationRequest.findMany({
      where,
      select: {
        ...requestSummarySelect,
        student: { select: studentDeclarationSelect },
      },
      orderBy: [
        { createdAt: filter === "READY_FOR_PICKUP" ? "desc" : "asc" },
        { id: "asc" },
      ],
      skip: (page - 1) * 20,
      take: 20,
    });
    return Response.json(
      {
        requests: rows.map((row) => ({
          ...requestSummary(row),
          student: studentView(row.student),
        })),
        page,
        pageSize: 20,
        total,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = requestFailure(error);
    return Response.json(
      { error: failure.error },
      { status: failure.status, headers: privateHeaders },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: "Origem não autorizada." },
      { status: 403, headers: privateHeaders },
    );
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: "Entre novamente para continuar." },
        { status: 401, headers: privateHeaders },
      );
    if (!canManageDeclarations(session.role))
      return Response.json(
        { error: "Sua conta não pode liberar documentos para retirada." },
        { status: 403, headers: privateHeaders },
      );
    const raw = await request.text();
    if (raw.length > 1000)
      return Response.json(
        { error: "Dados acima do limite." },
        { status: 413, headers: privateHeaders },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "Confira a solicitação." },
        { status: 400, headers: privateHeaders },
      );
    }
    if (!body || !validRequestId(body.id))
      return Response.json(
        { error: "Escolha uma solicitação válida." },
        { status: 400, headers: privateHeaders },
      );
    if (body.confirmed !== true)
      return Response.json(
        {
          error:
            "Confirme que o documento foi preparado e está disponível para retirada.",
        },
        { status: 422, headers: privateHeaders },
      );
    return Response.json(
      { request: await markReadyForPickup(body.id, session.accountId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = requestFailure(error);
    return Response.json(
      { error: failure.error },
      { status: failure.status, headers: privateHeaders },
    );
  }
}
