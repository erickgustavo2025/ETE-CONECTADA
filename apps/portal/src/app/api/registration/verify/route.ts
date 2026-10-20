import { withApiCanonicalPath } from '@/lib/api-route';
import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import { getDb } from '@/lib/db';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import { readAccessBody, boundedString } from '@/lib/access-input';
import { createHash } from 'node:crypto';
import {
  verifyAccount,
  RegistrationConflict,
} from '@/lib/account-registration';
import {
  databaseErrorResponse,
  disabledResponse,
  registrationEnabled,
} from '@/lib/registration';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const body = input.body;
  if (
    !boundedString(body.token, 50) ||
    !/^[A-Za-z0-9_-]{40,50}$/.test(body.token)
  )
    return Response.json({ error: 'Link inválido.' }, { status: 400 });
  const hash = createHash('sha256').update(body.token).digest('hex');
  try {
    const limit = accessLimitResponse(
      await consumeAccessAttempt(getDb(), 'email-verification', body.token),
    );
    if (limit) return limit;
    await verifyAccount(hash);
    return Response.json({ result: 'verified' });
  } catch (error) {
    if (error instanceof RegistrationConflict) {
      return Response.json(
        {
          error:
            error.reason === 'invalid'
              ? 'Este link é inválido ou expirou.'
              : 'Este link não pode mais ser usado.',
        },
        { status: 400 },
      );
    }
    return databaseErrorResponse();
  }
}

export const POST = withApiCanonicalPath(handlePOST);
