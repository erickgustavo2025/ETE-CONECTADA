import { synchronizeCatalogueBatch } from './school-academic-catalogue';
import { Prisma } from '../generated/prisma/client';
import { getDb } from './db';
import { declarationRegistryPreviewEnabled } from './declaration-documents';
import { RequestError, validRequestId } from './declaration-requests';
import type { SchoolClassResult } from './student-administration-types';

export function readClassCatalogueInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RequestError('Confira os filtros das turmas.', 400);
  const input = value as Record<string, unknown>;
  const page = input.page ?? 1;
  if (
    Object.keys(input).some(
      (k) => !['operation', 'mode', 'page', 'afterStudentId'].includes(k),
    ) ||
    input.operation !== 'classes' ||
    typeof input.mode !== 'string' ||
    !['INTEGRADO', 'SUBSEQUENTE'].includes(input.mode) ||
    (input.afterStudentId !== undefined &&
      input.afterStudentId !== null &&
      !validRequestId(input.afterStudentId)) ||
    !Number.isSafeInteger(page) ||
    Number(page) < 1 ||
    Number(page) > 10000
  )
    throw new RequestError('Confira os filtros das turmas.', 400);
  return {
    mode: input.mode as 'INTEGRADO' | 'SUBSEQUENTE',
    page: Number(page),
    afterStudentId:
      typeof input.afterStudentId === 'string' ? input.afterStudentId : null,
  };
}

export async function listSchoolClasses(
  actorId: string,
  value: unknown,
): Promise<SchoolClassResult> {
  if (!declarationRegistryPreviewEnabled())
    throw new RequestError('Página não disponível.', 404);
  if (!validRequestId(actorId))
    throw new RequestError('Acesso não autorizado.', 403);
  const input = readClassCatalogueInput(value);
  return getDb().$transaction(
    async (tx) => {
      const actors = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM accounts WHERE id=${actorId}::uuid AND role='secretary' AND status='active' FOR SHARE`;
      if (!actors.length)
        throw new RequestError(
          'Seu acesso à secretaria mudou. Entre novamente.',
          403,
        );
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(774056)::text`;
      const sweep = await synchronizeCatalogueBatch(
        tx,
        input.mode,
        input.afterStudentId,
      );
      if (sweep.nextCursor)
        return {
          classes: [],
          page: input.page,
          hasNext: false,
          updating: true,
          nextCursor: sweep.nextCursor,
        };
      // A lista é agregada e paginada no banco. Não envia nomes de alunos nem
      // confunde turmas com o mesmo nome em períodos ou modalidades diferentes.
      const rows = await tx.$queryRaw<
        Array<{
          mode: 'INTEGRADO' | 'SUBSEQUENTE';
          className: string;
          periodLabel: string | null;
          courseLabel: string;
          students: bigint;
        }>
      >(Prisma.sql`
      SELECT e.mode::text AS mode, e.class_name AS "className", e.period_label AS "periodLabel",
             e.course_label AS "courseLabel", COUNT(DISTINCT e.student_id) AS students
      FROM enrollments e
      WHERE e.mode::text=${input.mode} AND e.status::text <> 'ENDED'
        AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.student_id=e.student_id AND a.role <> 'student')
      GROUP BY e.mode, e.class_name, e.period_label, e.course_label
      ORDER BY e.class_name, e.period_label NULLS LAST, e.course_label
      LIMIT 21 OFFSET ${(input.page - 1) * 20}
    `);
      return {
        classes: rows
          .slice(0, 20)
          .map((r) => ({ ...r, students: Number(r.students) })),
        page: input.page,
        hasNext: rows.length > 20,
        updating: false,
        nextCursor: null,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
