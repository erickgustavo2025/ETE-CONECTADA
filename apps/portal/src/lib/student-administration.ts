import { Prisma } from '../generated/prisma/client';
import { getDb } from './db';
import { declarationPortalEnabled } from './declaration-documents';
import { RequestError, validRequestId } from './declaration-requests';
import { readStudentAdminInput } from './student-administration-input';
import type { StudentAccessInput } from './student-administration-input';
import type { StudentAdminResult } from './student-administration-types';

const select = {
  id: true,
  fullName: true,
  schoolRegistration: true,
  loginBlocked: true,
  issuanceBlocked: true,
  accessRevision: true,
  account: { select: { status: true, role: true } },
  _count: {
    select: {
      enrollments: {
        where: {
          status: { not: 'ENDED' as const },
          repetitionPending: true,
          repetitionOverride: false,
        },
      },
    },
  },
  enrollments: {
    select: {
      id: true,
      mode: true,
      className: true,
      courseLabel: true,
      grade: true,
      moduleNumber: true,
      periodLabel: true,
      status: true,
      repetitionPending: true,
      repetitionOverride: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 10,
  },
} satisfies Prisma.StudentSelect;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof select }>;
const summary = (s: StudentRow) => ({
  id: s.id,
  name: s.fullName ?? 'Nome não informado',
  registration: s.schoolRegistration,
  loginBlocked: s.loginBlocked,
  issuanceBlocked: s.issuanceBlocked,
  academicWaiting: s._count.enrollments > 0,
  revision: s.accessRevision,
  accountStatus: s.account?.status ?? null,
  enrollments: s.enrollments,
});
const studentOnly: Prisma.StudentWhereInput = {
  OR: [{ account: { is: null } }, { account: { is: { role: 'student' } } }],
};
const pageSize = 20;
async function change(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: StudentAccessInput,
) {
  // A conta do aluno vem antes da linha do aluno, como no login/emissão.
  const targets = await tx.$queryRaw<
    Array<{ role: string }>
  >`SELECT role FROM accounts WHERE student_id=${input.studentId}::uuid FOR UPDATE`;
  if (targets.some((a) => a.role !== 'student'))
    throw new RequestError('Esta página administra somente alunos.', 403);
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM students WHERE id=${input.studentId}::uuid FOR UPDATE`;
  if (!rows.length)
    throw new RequestError('Aluno não encontrado. Atualize a busca.', 404);
  const old = await tx.studentAccessChange.findUnique({
    where: {
      createdById_requestKey: {
        createdById: actorId,
        requestKey: input.requestKey,
      },
    },
  });
  if (old) {
    if (
      old.studentId !== input.studentId ||
      old.kind !== input.kind ||
      old.blocked !== input.blocked ||
      old.reason !== input.reason ||
      old.revision !== input.revision + 1
    )
      throw new RequestError(
        'Esta tentativa já foi usada. Atualize os dados do aluno.',
        409,
      );
    return false;
  }
  const current = await tx.student.findUniqueOrThrow({
    where: { id: input.studentId },
    select: { accessRevision: true, loginBlocked: true, issuanceBlocked: true },
  });
  if (current.accessRevision !== input.revision)
    throw new RequestError(
      'Outra pessoa alterou este aluno. Confira os dados atualizados antes de tentar novamente.',
      409,
    );
  const key = input.kind === 'LOGIN' ? 'loginBlocked' : 'issuanceBlocked';
  if (current[key] === input.blocked)
    throw new RequestError(
      'Esta situação já está registrada. Atualize os dados do aluno.',
      409,
    );
  await tx.student.update({
    where: { id: input.studentId },
    data: { [key]: input.blocked, accessRevision: { increment: 1 } },
  });
  await tx.studentAccessChange.create({
    data: {
      studentId: input.studentId,
      createdById: actorId,
      requestKey: input.requestKey,
      kind: input.kind,
      blocked: input.blocked,
      reason: input.reason,
      revision: input.revision + 1,
    },
  });
  if (input.kind === 'LOGIN' && input.blocked)
    await tx.session.deleteMany({
      where: { account: { studentId: input.studentId, role: 'student' } },
    });
  return true;
}
export async function administerStudents(
  actorId: string,
  value: unknown,
): Promise<StudentAdminResult> {
  if (!declarationPortalEnabled())
    throw new RequestError('Página não disponível.', 404);
  if (!validRequestId(actorId))
    throw new RequestError('Acesso não autorizado.', 403);
  const input = readStudentAdminInput(value);
  return getDb().$transaction(
    async (tx) => {
      const actors = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM accounts WHERE id=${actorId}::uuid AND role='secretary' AND status='active' FOR SHARE`;
      if (!actors.length)
        throw new RequestError(
          'Seu acesso à secretaria mudou. Entre novamente.',
          403,
        );
      let created: boolean | undefined;
      if (input.operation === 'change')
        created = await change(tx, actorId, input);
      if (input.operation !== 'search') {
        const row = await tx.student.findFirst({
          where: { id: input.studentId, ...studentOnly },
          select,
        });
        if (!row)
          throw new RequestError(
            'Aluno não encontrado. Atualize a busca.',
            404,
          );
        const total = await tx.studentAccessChange.count({
          where: { studentId: row.id },
        });
        const page = Math.min(
          input.operation === 'detail' ? input.page : 1,
          Math.max(1, Math.ceil(total / pageSize)),
        );
        const history = await tx.studentAccessChange.findMany({
          where: { studentId: row.id },
          select: {
            kind: true,
            blocked: true,
            reason: true,
            createdAt: true,
            revision: true,
            createdBy: {
              select: {
                staffName: true,
                student: { select: { fullName: true } },
              },
            },
          },
          orderBy: { revision: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        return {
          students: [],
          student: summary(row),
          classes: [],
          history: history.map((h) => ({
            kind: h.kind as 'LOGIN' | 'ISSUANCE',
            blocked: h.blocked,
            reason: h.reason,
            date: h.createdAt.toISOString(),
            actor:
              h.createdBy.staffName ??
              h.createdBy.student?.fullName ??
              'Responsável da secretaria',
            revision: h.revision,
          })),
          total,
          page,
          pageSize,
          ...(created === undefined ? {} : { created }),
        };
      }
      const enrollment: Prisma.EnrollmentWhereInput = {
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.className ? { className: input.className } : {}),
        ...(input.periodLabel !== undefined
          ? { periodLabel: input.periodLabel }
          : {}),
        ...(input.courseLabel ? { courseLabel: input.courseLabel } : {}),
      };
      const where: Prisma.StudentWhereInput = {
        AND: [
          studentOnly,
          ...(input.query
            ? [
                {
                  OR: [
                    {
                      fullName: {
                        contains: input.query,
                        mode: 'insensitive' as const,
                      },
                    },
                    { schoolRegistration: { startsWith: input.query } },
                  ],
                },
              ]
            : []),
          ...(input.mode ||
          input.className ||
          input.periodLabel !== undefined ||
          input.courseLabel
            ? [{ enrollments: { some: enrollment } }]
            : []),
          ...(input.status === 'LOGIN_BLOCKED'
            ? [{ loginBlocked: true }]
            : input.status === 'ISSUANCE_BLOCKED'
              ? [
                  {
                    OR: [
                      { issuanceBlocked: true },
                      {
                        enrollments: {
                          some: {
                            status: { not: 'ENDED' as const },
                            repetitionPending: true,
                            repetitionOverride: false,
                          },
                        },
                      },
                    ],
                  },
                ]
              : input.status === 'UNBLOCKED'
                ? [
                    {
                      loginBlocked: false,
                      issuanceBlocked: false,
                      enrollments: {
                        none: {
                          status: { not: 'ENDED' as const },
                          repetitionPending: true,
                          repetitionOverride: false,
                        },
                      },
                    },
                  ]
                : []),
        ],
      };
      const total = await tx.student.count({ where });
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const rows = await tx.student.findMany({
        where,
        select,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      const classes = await tx.enrollment.findMany({
        where: {
          ...(input.mode ? { mode: input.mode } : {}),
          student: studentOnly,
        },
        select: { className: true },
        distinct: ['className'],
        orderBy: { className: 'asc' },
        take: 200,
      });
      return {
        students: rows.map(summary),
        student: null,
        history: [],
        classes: classes.map((c) => c.className),
        total,
        page,
        pageSize,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
