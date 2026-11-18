import { after } from 'next/server';
import {
  accountChangeError,
  finishAccountChange,
  readAccountChange,
} from '@/lib/account-change-http';
import { changeAccountPassword } from '@/lib/account-password-change';
import { withApiCanonicalPath } from '@/lib/api-route';
import { recoveryMailer } from '@/lib/recovery-mail';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const input = await readAccountChange(request, [
      'currentPassword',
      'newPassword',
      'confirmPassword',
    ]);
    if ('response' in input) return input.response;
    const { currentPassword, newPassword, confirmPassword } = input.body;
    const result = await changeAccountPassword(input.db, input.sessionHash, {
      currentPassword,
      newPassword,
      confirmPassword,
    });
    const mailer = recoveryMailer();
    if (mailer)
      after(async () => {
        try {
          await mailer.notify(result.email);
        } catch {
          console.error('Falha ao enviar aviso de alteração de senha.');
        }
      });
    return finishAccountChange();
  } catch (error) {
    return accountChangeError(
      error,
      'Use de 8 a 128 caracteres e confirme a nova senha.',
      'Escolha uma senha diferente da atual.',
    );
  }
}

export const POST = withApiCanonicalPath(handlePOST);
