import { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createHash } from 'node:crypto';
import {
  matchesRegisteredParent,
  type RegisteredParentage,
} from '@/lib/registration';

type ClaimStudent = {
  id: string;
  schoolRegistration: string | null;
  fullName: string | null;
  birthDate: Date;
  registrationAllowed: boolean;
  details: RegisteredParentage | null;
};
// Vincula o link à conferência vigente; não armazena outra cópia dos nomes.
function claimDataHash(student: ClaimStudent) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        student.id,
        student.schoolRegistration,
        student.fullName,
        student.birthDate.toISOString(),
        student.registrationAllowed,
        student.details?.parentOne,
        student.details?.parentTwo,
        student.details?.parentageSource,
      ]),
    )
    .digest('hex');
}

export class RegistrationConflict extends Error {
  constructor(
    public readonly reason:
      | 'unmatched'
      | 'created'
      | 'pending'
      | 'invalid'
      | 'used'
      | 'cpf',
  ) {
    super(reason);
  }
}

// Repete apenas conflitos de serialização; a transação inteira é desfeita antes.
async function serializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 15000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034' ||
        attempt >= 2
      )
        throw error;
    }
  }
}

export async function claimAccount(input: {
  schoolRegistration: string;
  cpf: string;
  birthDate: Date;
  parentName: string;
  email: string;
  password: string;
  passwordHash: string;
  tokenHash: string;
}) {
  return serializable(async (tx) => {
    const student = await tx.student.findFirst({
      where: {
        schoolRegistration: input.schoolRegistration,
        birthDate: input.birthDate,
        registrationAllowed: true,
      },
      include: { account: true, details: true },
    });
    if (!student || !matchesRegisteredParent(input.parentName, student.details))
      throw new RegistrationConflict('unmatched');
    if (student.account?.status === 'active')
      throw new RegistrationConflict('created');
    if (student.cpf && student.cpf !== input.cpf)
      throw new RegistrationConflict('cpf');
    if (student.account?.status === 'pending') {
      const liveToken = await tx.emailVerificationToken.findFirst({
        where: {
          accountId: student.account.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { tokenHash: true },
      });
      // Enquanto há um link válido, somente os dados já escolhidos podem renová-lo.
      // Isso impede trocar o destinatário de uma confirmação ainda em andamento.
      if (
        liveToken &&
        (student.account.email !== input.email ||
          !student.account.passwordHash ||
          !(await verifyPassword(input.password, student.account.passwordHash)))
      ) {
        throw new RegistrationConflict('pending');
      }
    }
    // Matrícula identifica o registro importado. CPF é incluído somente nesta etapa.
    await tx.student.update({
      where: { id: student.id },
      data: { cpf: input.cpf },
    });
    const data = {
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'pending',
      updatedAt: new Date(),
    };
    const account = student.account
      ? await tx.account.update({ where: { id: student.account.id }, data })
      : await tx.account.create({ data: { ...data, studentId: student.id } });
    await tx.emailVerificationToken.deleteMany({
      where: { accountId: account.id },
    });
    await tx.emailVerificationToken.create({
      data: {
        tokenHash: input.tokenHash,
        accountId: account.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        claimDataHash: claimDataHash(student),
      },
    });
  });
}

export async function verifyAccount(tokenHash: string) {
  return serializable(async (tx) => {
    const now = new Date();
    const used = await tx.emailVerificationToken.updateMany({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (!used.count) throw new RegistrationConflict('invalid');
    const token = await tx.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash },
    });
    const current = await tx.account.findUniqueOrThrow({
      where: { id: token.accountId },
      include: { student: { include: { details: true } } },
    });
    // Links anteriores à conferência, ou emitidos antes de uma correção/bloqueio,
    // não podem ativar a conta. O rollback também desfaz o consumo do token.
    if (
      !current.student.registrationAllowed ||
      !token.claimDataHash ||
      token.claimDataHash !== claimDataHash(current.student)
    )
      throw new RegistrationConflict('invalid');
    const account = await tx.account.updateMany({
      where: { id: token.accountId, status: 'pending' },
      data: { status: 'active', updatedAt: now },
    });
    if (!account.count) throw new RegistrationConflict('used');
  });
}
