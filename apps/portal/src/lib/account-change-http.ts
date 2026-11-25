import { NextResponse } from 'next/server';
import { accessLimitResponse, consumeAccessAttempt } from './access-throttle';
import {
  AccountChangeError,
  type AccountChangeProblem,
} from './account-change-auth';
import { getDb } from './db';
import {
  privateHeaders,
  readPrivateBody,
  sameOriginRequest,
} from './private-request';
import { currentSessionHash } from './session';
import { sessionCookiePolicy } from './session-cookie';
import { findSessionRecord } from './session-record';
import { portalAccessEnabled } from './portal-access';

export function accountChangeFailure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateHeaders });
}

export async function readAccountChange(
  request: Request,
  fields: string[],
): Promise<
  | { response: Response }
  | {
      db: ReturnType<typeof getDb>;
      sessionHash: string;
      body: Record<string, unknown>;
    }
> {
  if (!portalAccessEnabled())
    return {
      response: accountChangeFailure(
        'Alterações de conta indisponíveis neste ambiente.',
        503,
      ),
    };
  if (!sameOriginRequest(request))
    return {
      response: accountChangeFailure('Solicitação não autorizada.', 403),
    };
  const sessionHash = await currentSessionHash();
  if (!sessionHash)
    return {
      response: accountChangeFailure('Entre novamente para continuar.', 401),
    };
  const db = getDb();
  const session = await findSessionRecord(db, sessionHash);
  if (!session)
    return {
      response: accountChangeFailure('Entre novamente para continuar.', 401),
    };
  const input = await readPrivateBody(request, 2000);
  if ('response' in input) return input;
  if (Object.keys(input.body).some((key) => !fields.includes(key)))
    return {
      response: accountChangeFailure('Confira os campos enviados.', 422),
    };
  const limit = accessLimitResponse(
    await consumeAccessAttempt(db, 'account-change', session.accountId),
  );
  if (limit) {
    for (const [key, value] of Object.entries(privateHeaders))
      limit.headers.set(key, value);
    return { response: limit };
  }
  return { db, sessionHash, body: input.body };
}

export function finishAccountChange() {
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
}

const messages: Partial<Record<AccountChangeProblem, string>> = {
  link: 'Este link é inválido ou expirou. Solicite outro em Minha conta.',
  password: 'A senha atual está incorreta.',
};

export function accountChangeError(
  error: unknown,
  format: string,
  same = format,
) {
  if (!(error instanceof AccountChangeError))
    return accountChangeFailure(
      'Não foi possível concluir agora. Tente novamente mais tarde.',
      503,
    );
  if (error.reason === 'staff-email')
    return accountChangeFailure(
      'Peça à gestão da escola para atualizar o e-mail da secretaria.',
      403,
    );
  if (error.reason === 'session')
    return accountChangeFailure('Entre novamente para continuar.', 401);
  return accountChangeFailure(
    error.reason === 'same' ? same : (messages[error.reason] ?? format),
    422,
  );
}
