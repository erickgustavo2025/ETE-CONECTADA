import { withApiCanonicalPath } from '@/lib/api-route';
import { canManageDeclarations } from '@/lib/declaration-access';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { studentDeclarationSelect, studentView } from '@/lib/declarations';
import {
  sameOriginRequest,
  privateHeaders,
  readPrivateBody,
} from '@/lib/private-request';

export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: 'Entre novamente para continuar.' },
        { status: 401, headers: privateHeaders },
      );
    if (!canManageDeclarations(session.role))
      return Response.json(
        { error: 'Esta área é exclusiva da secretaria.' },
        { status: 403, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 4096);
    if ('response' in input) return input.response;
    const body = input.body;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const className =
      typeof body.className === 'string' ? body.className.trim() : '';
    const allClass = body.allClass === true;
    const page = Number(body.page ?? 1);
    if (
      query.length > 120 ||
      className.length > 120 ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      (allClass && (!className || query))
    )
      return Response.json(
        {
          error:
            'Confira a busca. Para selecionar a turma inteira, limpe o nome ou matrícula.',
        },
        { status: 400, headers: privateHeaders },
      );
    const db = getDb();
    const classRows = await db.enrollment.findMany({
      where: { mode: 'INTEGRADO' },
      select: { className: true },
      distinct: ['className'],
      orderBy: { className: 'asc' },
    });
    const classes = classRows.map((row) => row.className);
    if (!query && !className)
      return Response.json(
        { students: [], total: 0, page: 1, pageSize: 20, classes },
        { headers: privateHeaders },
      );
    const where = {
      enrollments: { some: className ? { className } : {} },
      ...(query
        ? {
            OR: [
              { fullName: { contains: query, mode: 'insensitive' as const } },
              { schoolRegistration: { startsWith: query } },
              {
                enrollments: {
                  some: {
                    className: {
                      contains: query,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const total = await db.student.count({ where });
    if (allClass && total > 100)
      return Response.json(
        {
          error:
            'Esta turma tem mais de 100 alunos. Selecione por páginas para preparar lotes de até 100.',
        },
        { status: 422, headers: privateHeaders },
      );
    const pageSize = allClass ? 100 : 20;
    const actualPage = allClass
      ? 1
      : Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await db.student.findMany({
      where,
      select: studentDeclarationSelect,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: pageSize,
      skip: (actualPage - 1) * pageSize,
    });
    return Response.json(
      {
        students: rows.map(studentView),
        total,
        page: actualPage,
        pageSize,
        classes,
      },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: 'Não foi possível carregar os alunos. Tente novamente.' },
      { status: 503, headers: privateHeaders },
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
