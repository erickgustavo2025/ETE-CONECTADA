import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { invalidateAccountCredentials } from '../src/lib/account-change-auth';
import { isStaffIdentity, newStaffInvite } from '../src/lib/password-reset';
import { normalizeEmail } from '../src/lib/registration';
import { configuredOrigin } from '../src/lib/portal-origin';

type StaffAccess =
  | { action: 'invite'; email: string; name: string; reason: string }
  | { action: 'revoke'; email: string; reason: string };

export class StaffAccessError extends Error {}

async function verifyOperator(tx: Prisma.TransactionClient) {
  const [result] = await tx.$queryRaw<{ allowed: boolean }[]>`
    SELECT pg_has_role(session_user, relowner, 'MEMBER') AS allowed
    FROM pg_class WHERE oid = 'public.accounts'::regclass
  `;
  if (!result?.allowed)
    throw new StaffAccessError('Use a credencial de manutenção autorizada.');
}

export async function changeStaffAccess(
  db: PrismaClient,
  input: StaffAccess,
  delivery?: {
    origin: string;
    send(email: string, link: string): Promise<void>;
  },
) {
  const email = normalizeEmail(input.email);
  const reason = input.reason.trim();
  const name =
    input.action === 'invite' ? input.name.trim().replace(/ +/gu, ' ') : '';
  const origin = configuredOrigin(delivery?.origin);
  if (
    !email ||
    /[\p{Cc}\p{Cf}<>,;"()[\]\\]/u.test(email) ||
    reason.length < 5 ||
    reason.length > 300 ||
    /[\p{Cc}\p{Cf}]/u.test(reason)
  )
    throw new StaffAccessError(
      'Confira o e-mail e informe um motivo de 5 a 300 caracteres.',
    );
  if (input.action === 'invite' && (!delivery || !origin))
    throw new StaffAccessError(
      'Configure o remetente e o endereço do portal antes de convidar.',
    );
  if (
    input.action === 'invite' &&
    (name.length < 2 || name.length > 180 || /[\p{Cc}\p{Cf}]/u.test(name))
  )
    throw new StaffAccessError('Confira o nome da pessoa da secretaria.');

  const ticket = await db.$transaction(
    async (tx) => {
      await verifyOperator(tx);
      // A mesma trava de autenticação/recuperação define a ordem entre
      // revogação, login simultâneo e consumo do convite.
      const matches = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM accounts WHERE lower(email) = ${email}
      ORDER BY id LIMIT 2 FOR UPDATE
    `;
      const existing =
        matches.length === 1
          ? await tx.account.findUniqueOrThrow({ where: { id: matches[0].id } })
          : null;
      if (matches.length > 1 || (existing && !isStaffIdentity(existing)))
        throw new StaffAccessError(
          'O endereço está vinculado a outra conta. Confira com a escola.',
        );

      if (input.action === 'revoke') {
        if (!existing)
          throw new StaffAccessError('Conta da secretaria não encontrada.');
        await tx.account.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            passwordHash: null,
            updatedAt: new Date(),
          },
        });
        await invalidateAccountCredentials(tx, existing.id);
        await tx.staffAccessEvent.create({
          data: { accountId: existing.id, action: 'STAFF_REVOKED', reason },
        });
        return null;
      }

      if (existing?.status === 'active')
        throw new StaffAccessError('Essa pessoa já tem acesso ativo.');
      const account = existing
        ? await tx.account.update({
            where: { id: existing.id },
            data: { staffName: name, updatedAt: new Date() },
          })
        : await tx.account.create({
            data: {
              email,
              staffName: name,
              role: 'secretary',
              status: 'pending',
            },
          });
      await invalidateAccountCredentials(tx, account.id);
      const invite = newStaffInvite(account);
      await tx.passwordResetToken.create({ data: invite.record });
      await tx.staffAccessEvent.create({
        data: { accountId: account.id, action: 'STAFF_INVITED', reason },
      });
      return invite.token;
    },
    { maxWait: 15000, timeout: 15000 },
  );

  if (!ticket || !delivery || !origin) return;
  try {
    await delivery.send(
      email,
      `${origin}/redefinir-senha?convite=1#token=${ticket}`,
    );
  } catch {
    throw new StaffAccessError(
      'O convite ficou pendente. Confira o envio e gere outro convite se necessário.',
    );
  }
}
