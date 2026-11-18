import { after } from 'next/server';
import {
  accountChangeError,
  finishAccountChange,
  readAccountChange,
} from '@/lib/account-change-http';
import { confirmAccountEmailChange } from '@/lib/account-email-change';
import { accountEmailMailer } from '@/lib/account-email-mail';
import { withApiCanonicalPath } from '@/lib/api-route';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const input = await readAccountChange(request, ['token']);
    if ('response' in input) return input.response;
    const { previousEmail, newEmail } = await confirmAccountEmailChange(
      input.db,
      input.sessionHash,
      input.body.token,
    );
    const mailer = accountEmailMailer();
    if (mailer)
      after(async () => {
        const notices = await Promise.allSettled([
          mailer.notify(previousEmail),
          mailer.notify(newEmail),
        ]);
        if (notices.some((notice) => notice.status === 'rejected'))
          console.error('Falha ao enviar aviso de alteração de e-mail.');
      });
    return finishAccountChange();
  } catch (error) {
    return accountChangeError(
      error,
      'Não foi possível confirmar o novo e-mail.',
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
