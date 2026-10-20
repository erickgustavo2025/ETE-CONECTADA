import { withApiCanonicalPath } from '@/lib/api-route';
import { recordGeneratedDeclarations } from '@/lib/declaration-requests';
import { canManageDeclarations } from '@/lib/declaration-access';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import {
  studentDeclarationSelect,
  validateDeclarationFields,
  DeclarationValidationError,
} from '@/lib/declarations';
import { createDeclarationsPdf } from '@/lib/declaration-pdf';
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
        { error: 'Somente a secretaria pode preparar as declarações.' },
        { status: 403, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 400000);
    if ('response' in input) return input.response;
    const body = input.body;
    if (
      !body ||
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 100
    )
      return Response.json(
        { error: 'Selecione de 1 a 100 declarações por PDF.' },
        { status: 400, headers: privateHeaders },
      );
    const items = body.items.map((item: unknown, index: number) => {
      try {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          throw new DeclarationValidationError(
            'Confira os dados da declaração.',
          );
        const value = item as Record<string, unknown>;
        if (
          typeof value.studentId !== 'string' ||
          !/^[0-9a-f-]{36}$/i.test(value.studentId)
        )
          throw new DeclarationValidationError('Selecione um aluno válido.');
        return {
          studentId: value.studentId,
          fields: validateDeclarationFields(item),
        };
      } catch (error) {
        if (error instanceof DeclarationValidationError)
          error.itemIndex = index;
        throw error;
      }
    }) as {
      studentId: string;
      fields: ReturnType<typeof validateDeclarationFields>;
    }[];
    if (new Set(items.map((item) => item.studentId)).size !== items.length)
      throw new DeclarationValidationError('O lote contém um aluno repetido.');
    const students = await getDb().student.findMany({
      where: { id: { in: items.map((item) => item.studentId) } },
      select: studentDeclarationSelect,
    });
    const selected = items.map((item, index) => {
      const student = students.find((student) => student.id === item.studentId);
      if (!student) {
        const error = new DeclarationValidationError(
          'Aluno não encontrado. Atualize a seleção.',
        );
        error.itemIndex = index;
        throw error;
      }
      return { student, fields: item.fields };
    });
    const pdf = await createDeclarationsPdf(selected);
    await recordGeneratedDeclarations(
      selected.map((item) => ({
        studentId: item.student.id,
        enrollmentId: item.fields.enrollmentId,
        periodLabel: item.fields.schoolPeriod,
        calendarRevision: item.student.enrollments.find(
          (row) => row.id === item.fields.enrollmentId,
        )!.calendarRevision,
        reviewedAt: item.student.enrollments.find(
          (row) => row.id === item.fields.enrollmentId,
        )!.reviewedAt,
      })),
      session.accountId,
    );
    return new Response(Buffer.from(pdf), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="declaracoes-vinculo-minutas.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof DeclarationValidationError)
      return Response.json(
        {
          error: error.message,
          field: error.field,
          itemIndex: error.itemIndex,
        },
        { status: 422, headers: privateHeaders },
      );
    return Response.json(
      {
        error:
          'Não foi possível preparar o lote. Nenhum dado foi alterado; tente novamente.',
      },
      { status: 503, headers: privateHeaders },
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
