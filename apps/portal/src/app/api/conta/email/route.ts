import { after } from 'next/server';
import {
  accountChangeError,
  accountChangeFailure,
  readAccountChange,
} from '@/lib/account-change-http';
import { requestAccountEmailChange } from '@/lib/account-email-change';
import { accountEmailMailer } from '@/lib/account-email-mail';
import { withApiCanonicalPath } from '@/lib/api-route';
import { privateHeaders } from '@/lib/private-request';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const input = await readAccountChange(request, [
      'currentPassword',
      'newEmail',
    ]);
    if ('response' in input) return input.response;
    const mailer = accountEmailMailer();
    if (!mailer)
      return accountChangeFailure(
        'Envio de e-mail indisponível agora. Tente novamente mais tarde.',
        503,
      );
    const { currentPassword, newEmail } = input.body;
    const pending = await requestAccountEmailChange(
      input.db,
      input.sessionHash,
      { currentPassword, newEmail },
      mailer.origin,
    );
    if (pending)
      after(async () => {
        try {
          await mailer.confirmation(pending.email, pending.confirmationLink);
        } catch {
          console.error('Falha ao enviar confirmação de novo e-mail.');
        }
      });
    return Response.json(
      { result: 'requested' },
      { status: 202, headers: privateHeaders },
    );
  } catch (error) {
    return accountChangeError(
      error,
      'Confira a senha atual e o novo e-mail.',
      'Informe um e-mail diferente do atual.',
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
