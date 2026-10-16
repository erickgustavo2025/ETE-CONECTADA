import { after } from 'next/server';
import { readAccessBody } from '@/lib/access-input';
import { getDb } from '@/lib/db';
import { databaseErrorResponse, disabledResponse } from '@/lib/registration';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
import {
  completePasswordReset,
  PasswordResetError,
} from '@/lib/password-reset';
import { recoveryMailer } from '@/lib/recovery-mail';
import { resetProblem, type ResetProblem } from '@/lib/password-reset-input';

function rejected(reason: ResetProblem) {
  return Response.json(
    {
      error:
        reason === 'invalid'
          ? 'Este link é inválido ou expirou. Solicite outro link.'
          : reason === 'password'
            ? 'Use uma senha de 8 a 128 caracteres.'
            : 'As senhas precisam ser iguais.',
      ...(reason === 'invalid'
        ? {}
        : { field: reason === 'password' ? 'newPassword' : 'confirmPassword' }),
    },
    { status: 400, headers: privateHeaders },
  );
}

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return disabledResponse();
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const { token, password, confirmPassword } = input.body;
  const problem = resetProblem({ token, password, confirmPassword });
  if (problem) return rejected(problem);
  try {
    const result = await completePasswordReset(getDb(), {
      token,
      password,
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
    return Response.json({ result: 'changed' }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof PasswordResetError) return rejected(error.reason);
    return databaseErrorResponse();
  }
}
