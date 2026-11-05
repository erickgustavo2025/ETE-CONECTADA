import { withApiCanonicalPath } from '@/lib/api-route';
import {
  privateHeaders,
  sameOriginRequest,
  readPrivateBody,
} from '@/lib/private-request';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
import { consumeAccessAttempt } from '@/lib/access-throttle';
import { getDb } from '@/lib/db';
import {
  readPublicVerificationQuery,
  VerificationInputError,
} from '@/lib/public-verification-input';
import { readPublicVerification } from '@/lib/public-verification';
export const runtime = 'nodejs';
const headers = {
  ...privateHeaders,
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
async function handlePOST(request: Request) {
  if (!declarationRegistryPreviewEnabled())
    return Response.json(
      { error: 'Página não disponível.' },
      { status: 404, headers },
    );
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers },
    );
  const parsed = await readPrivateBody(request, 4096);
  if ('response' in parsed) return parsed.response;
  try {
    const input = readPublicVerificationQuery(parsed.body);
    const limit = await consumeAccessAttempt(
      getDb(),
      input.fullName === null ? 'document-lookup' : 'document-name',
      input.code,
    );
    if (!limit.allowed)
      return Response.json(
        {
          error: 'Muitas consultas. Aguarde alguns minutos e tente novamente.',
        },
        {
          status: 429,
          headers: { ...headers, 'Retry-After': String(limit.retryAfter) },
        },
      );
    const result = await readPublicVerification(input.code, input.fullName);
    return result
      ? Response.json(result, { headers })
      : Response.json(
          { error: 'Código não encontrado.' },
          { status: 404, headers },
        );
  } catch (error) {
    if (error instanceof VerificationInputError)
      return Response.json(
        { error: error.message, field: error.field },
        { status: 422, headers },
      );
    return Response.json(
      {
        error:
          'Não foi possível consultar agora. Isso não significa que o documento é inválido.',
      },
      { status: 503, headers },
    );
  }
}
const canonical = withApiCanonicalPath(handlePOST);
export async function POST(request: Request) {
  const response = await canonical(request);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}
