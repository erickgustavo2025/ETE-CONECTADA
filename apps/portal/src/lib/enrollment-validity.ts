import type { PrismaClient } from '../generated/prisma/client';

export class EnrollmentValidityError extends Error {
  constructor(
    message: string,
    public field = 'enrollmentId',
  ) {
    super(message);
  }
}

type VerifiedEnrollment = {
  status: string;
  periodLabel: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  reviewedAt: Date | null;
};

export function requireCurrentEnrollment(
  enrollment: VerifiedEnrollment,
  period?: string,
  now = new Date(),
) {
  if (
    enrollment.status !== 'ACTIVE' ||
    !enrollment.reviewedAt ||
    !enrollment.periodLabel ||
    !enrollment.validFrom ||
    !enrollment.validUntil
  ) {
    throw new EnrollmentValidityError(
      'A situação e a vigência desta matrícula precisam de conferência da secretaria.',
    );
  }
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
  }).format(now);
  const start = enrollment.validFrom.toISOString().slice(0, 10);
  const end = enrollment.validUntil.toISOString().slice(0, 10);
  if (start > day || end < day || start > end) {
    throw new EnrollmentValidityError(
      'Esta matrícula não tem vigência na data de emissão. Procure a secretaria.',
    );
  }
  if (period !== undefined && period !== enrollment.periodLabel) {
    throw new EnrollmentValidityError(
      'O período informado não corresponde ao período conferido da matrícula.',
      'schoolPeriod',
    );
  }
}

function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new EnrollmentValidityError('Informe uma data válida de vigência.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new EnrollmentValidityError('Informe uma data válida de vigência.');
  return parsed;
}

export function validateEnrollmentReview(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EnrollmentValidityError('Confira a situação da matrícula.');
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        !['status', 'periodLabel', 'validFrom', 'validUntil'].includes(key),
    )
  )
    throw new EnrollmentValidityError('Confira os campos da matrícula.');
  const status = (['UNCONFIRMED', 'ACTIVE', 'ENDED'] as const).find(
    (item) => item === body.status,
  );
  if (!status)
    throw new EnrollmentValidityError('Confira a situação da matrícula.');
  if (status !== 'ACTIVE') {
    if (Object.keys(body).length !== 1)
      throw new EnrollmentValidityError(
        'A mudança de situação preserva o período e as datas já registrados.',
      );
    return { status };
  }
  if (
    typeof body.periodLabel !== 'string' ||
    body.periodLabel.length > 60 ||
    /\p{Cc}/u.test(body.periodLabel)
  )
    throw new EnrollmentValidityError(
      'Informe o período letivo conferido.',
      'schoolPeriod',
    );
  const periodLabel = body.periodLabel.trim().replace(/\s+/g, ' ');
  if (!periodLabel)
    throw new EnrollmentValidityError(
      'Informe o período letivo conferido.',
      'schoolPeriod',
    );
  const validFrom = date(body.validFrom),
    validUntil = date(body.validUntil);
  if (validFrom > validUntil)
    throw new EnrollmentValidityError(
      'O início da vigência deve ser anterior ou igual ao fim.',
    );
  return { status, periodLabel, validFrom, validUntil };
}

// Serviço interno: o operador vem da sessão no servidor, nunca do corpo do aluno.
export async function reviewEnrollment(
  db: PrismaClient,
  actorId: string,
  enrollmentId: string,
  value: unknown,
) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(actorId) || !uuid.test(enrollmentId))
    throw new EnrollmentValidityError('Acesso não autorizado.');
  const data = validateEnrollmentReview(value);
  return db.$transaction(async (tx) => {
    const allowed = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM accounts WHERE id=${actorId}::uuid AND status='active' AND role='secretary' FOR UPDATE
    `;
    if (!allowed.length)
      throw new EnrollmentValidityError('Acesso não autorizado.');
    return tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        ...data,
        reviewedAt: new Date(),
        reviewedById: actorId,
      },
    });
  });
}
