import { after, NextResponse } from 'next/server';
import {
  accessLimitResponse,
  consumeAccessAttempt,
} from '@/lib/access-throttle';
import { AccountChangeError } from '@/lib/account-change-auth';
import { changeAccountPassword } from '@/lib/account-password-change';
import { withApiCanonicalPath } from '@/lib/api-route';
import { getDb } from '@/lib/db';
import {
  privateHeaders,
  readPrivateBody,
  sameOriginRequest,
} from '@/lib/private-request';
import { recoveryMailer } from '@/lib/recovery-mail';
import { databaseErrorResponse, disabledResponse } from '@/lib/registration';
import { currentSessionHash } from '@/lib/session';
import { sessionCookiePolicy } from '@/lib/session-cookie';
import { findSessionRecord } from '@/lib/session-record';

export const runtime = 'nodejs';

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateHeaders });
}

async function handlePOST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return disabledResponse();
  if (!sameOriginRequest(request))
    return failure('Solicitação não autorizada.', 403);
  try {
    const sessionHash = await currentSessionHash();
    if (!sessionHash) return failure('Entre novamente para continuar.', 401);
    const db = getDb();
    const session = await findSessionRecord(db, sessionHash);
    if (!session) return failure('Entre novamente para continuar.', 401);
    const input = await readPrivateBody(request, 2000);
    if ('response' in input) return input.response;
    const allowed = ['currentPassword', 'newPassword', 'confirmPassword'];
    if (Object.keys(input.body).some((key) => !allowed.includes(key)))
      return failure('Confira os campos da senha.', 422);
    const limit = accessLimitResponse(
      await consumeAccessAttempt(db, 'account-change', session.accountId),
    );
    if (limit) {
      for (const [key, value] of Object.entries(privateHeaders))
        limit.headers.set(key, value);
      return limit;
    }
    const { currentPassword, newPassword, confirmPassword } = input.body;
    const result = await changeAccountPassword(db, sessionHash, {
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

    const response = NextResponse.json(
      { result: 'changed' },
      { headers: privateHeaders },
    );
    const cookie = sessionCookiePolicy();
    response.cookies.set(cookie.name, '', {
      ...cookie.options,
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    if (!(error instanceof AccountChangeError)) return databaseErrorResponse();
    if (error.reason === 'session')
      return failure('Entre novamente para continuar.', 401);
    if (error.reason === 'password')
      return failure('A senha atual está incorreta.', 422);
    if (error.reason === 'same')
      return failure('Escolha uma senha diferente da atual.', 422);
    return failure('Use de 8 a 128 caracteres e confirme a nova senha.', 422);
  }
}

export const POST = withApiCanonicalPath(handlePOST);
