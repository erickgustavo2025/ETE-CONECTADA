import { withApiCanonicalPath } from '@/lib/api-route';
import { recordGeneratedDeclarations } from '@/lib/declaration-requests';
import { canManageDeclarations } from '@/lib/declaration-access';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import {
  declarationStudent,
  validateDeclarationFields,
  DeclarationValidationError,
} from '@/lib/declarations';
import { createDeclarationPdf } from '@/lib/declaration-pdf';
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
        { error: 'Somente a secretaria pode preparar a declaração.' },
        { status: 403, headers: privateHeaders },
      );
    const input = await readPrivateBody(request, 16000);
    if ('response' in input) return input.response;
    const body = input.body;
    if (
      typeof body.studentId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.studentId)
    )
      return Response.json(
        { error: 'Selecione um aluno.' },
        { status: 400, headers: privateHeaders },
      );
    const fields = validateDeclarationFields(body);
    const student = await declarationStudent(getDb(), body.studentId);
    if (!student)
      return Response.json(
        { error: 'Aluno não encontrado.' },
        { status: 404, headers: privateHeaders },
      );
    const pdf = await createDeclarationPdf(student, fields);
    await recordGeneratedDeclarations(
      [
        {
          studentId: student.id,
          enrollmentId: fields.enrollmentId,
          periodLabel: fields.schoolPeriod,
          reviewedAt: student.enrollments.find(
            (row) => row.id === fields.enrollmentId,
          )!.reviewedAt,
        },
      ],
      session.accountId,
    );
    return new Response(Buffer.from(pdf), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="declaracao-vinculo-minuta.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof DeclarationValidationError)
      return Response.json(
        { error: error.message, field: error.field },
        { status: 422, headers: privateHeaders },
      );
    return Response.json(
      {
        error:
          'Não foi possível gerar o PDF. Confira os dados e tente novamente.',
      },
      { status: 503, headers: privateHeaders },
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
