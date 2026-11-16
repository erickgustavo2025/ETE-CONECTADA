import type { Prisma } from '../generated/prisma/client';
import { calendarDay } from './course-calendar-input';
import { applyStudentAcademicProgression } from './school-academic';

// O chamador autentica a secretaria e mantém a trava acadêmica comum.
// Cursor é apenas paginação de manutenção; nunca concede acesso a cadastro.
export async function synchronizeCatalogueBatch(
  tx: Prisma.TransactionClient,
  mode: 'INTEGRADO' | 'SUBSEQUENTE',
  afterStudentId: string | null,
  now = new Date(),
) {
  const today = new Date(calendarDay(now));
  const candidates = await tx.student.findMany({
    where: {
      ...(afterStudentId ? { id: { gt: afterStudentId } } : {}),
      OR: [{ account: { is: null } }, { account: { is: { role: 'student' } } }],
      enrollments: {
        some: {
          mode,
          status: 'ACTIVE',
          progressionHeld: false,
          repetitionPending: false,
          reviewedAt: { lte: now },
          validFrom: { lte: today },
          validUntil: { lt: today },
          OR:
            mode === 'INTEGRADO'
              ? [{ courseLabel: { in: ['ADM', 'DS'] }, grade: { lt: 3 } }]
              : [
                  {
                    courseLabel: { in: ['ADM', 'DS'] },
                    moduleNumber: { lt: 3 },
                  },
                  { courseLabel: 'ENF', moduleNumber: { lt: 4 } },
                ],
        },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 201,
  });
  const batch = candidates.slice(0, 200);
  let advanced = 0;
  for (const student of batch)
    advanced += (await applyStudentAcademicProgression(tx, student.id, now))
      .advanced;
  return {
    advanced,
    processed: batch.length,
    nextCursor: candidates.length > 200 ? batch[batch.length - 1].id : null,
  };
}
