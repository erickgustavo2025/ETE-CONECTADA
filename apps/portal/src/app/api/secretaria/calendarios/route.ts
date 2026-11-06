import { withApiCanonicalPath } from '@/lib/api-route';
import { currentSession } from '@/lib/session';
import { privateHeaders, sameOriginRequest } from '@/lib/private-request';
export const runtime = 'nodejs';
async function handlePOST(request: Request) {
  const reply = (error: string, status: number) =>
    Response.json({ error }, { status, headers: privateHeaders });
  if (!sameOriginRequest(request)) return reply('Origem não autorizada.', 403);
  const session = await currentSession();
  if (!session) return reply('Entre novamente para continuar.', 401);
  if (session.role !== 'secretary')
    return reply('Acesso exclusivo da secretaria.', 403);
  return reply(
    'O cadastro manual de calendários foi encerrado. Importe a planilha da turma.',
    410,
  );
}
export const POST = withApiCanonicalPath(handlePOST);
