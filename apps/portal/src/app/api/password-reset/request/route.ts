import { after } from 'next/server';
import { boundedString, readAccessBody } from '@/lib/access-input';
import { getDb } from '@/lib/db';
import {
  normalizeEmail,
  disabledResponse,
  databaseErrorResponse,
} from '@/lib/registration';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
import { recoveryReceipt } from '@/lib/password-reset-input';
import { requestPasswordReset } from '@/lib/password-reset';
import { recoveryMailer } from '@/lib/recovery-mail';

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
  if (
    !boundedString(input.body.email, 320) ||
    !normalizeEmail(input.body.email)
  )
    return Response.json(
      { error: 'Informe um e-mail válido.' },
      { status: 400, headers: privateHeaders },
    );
  const email = normalizeEmail(input.body.email)!;
  try {
    const limit = accessLimitResponse(
      await consumeAccessAttempt(getDb(), 'password-recovery', email),
    );
    if (limit) return limit;
  } catch {
    return databaseErrorResponse();
  }
  // Mesma resposta antes de consultar a conta; latência de DB/provedor não enumera e-mails.
  const mailer = recoveryMailer();
  if (mailer)
    after(async () => {
      try {
        await requestPasswordReset(getDb(), email, mailer);
      } catch {
        console.error('Falha ao processar recuperação de acesso.');
      }
    });
  return Response.json(
    { message: recoveryReceipt },
    { headers: privateHeaders },
  );
}
