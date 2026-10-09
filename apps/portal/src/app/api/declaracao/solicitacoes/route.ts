import { currentSession } from "@/lib/session";
import { privateHeaders, sameOriginRequest } from "@/lib/private-request";
import {
  requestDeclaration,
  requestFailure,
  studentRequests,
  validRequestId,
} from "@/lib/declaration-requests";
export const runtime = "nodejs";
export async function GET() {
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: "Entre novamente para continuar." },
        { status: 401, headers: privateHeaders },
      );
    return Response.json(
      { requests: await studentRequests(session.studentId) },
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
        { error: "Confira a matrícula escolhida." },
        { status: 400, headers: privateHeaders },
      );
    }
    if (!body || !validRequestId(body.enrollmentId))
      return Response.json(
        { error: "Escolha sua matrícula." },
        { status: 400, headers: privateHeaders },
      );
    // A identidade vem da sessão. Nenhum studentId enviado pelo cliente é usado.
    const result = await requestDeclaration(
      session.studentId,
      body.enrollmentId,
    );
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers: privateHeaders,
    });
  } catch (error) {
    const failure = requestFailure(error);
    return Response.json(
      { error: failure.error },
      { status: failure.status, headers: privateHeaders },
    );
  }
}
