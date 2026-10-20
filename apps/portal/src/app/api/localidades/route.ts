import { withApiCanonicalPath } from '@/lib/api-route';
import { currentSession } from '@/lib/session';
import { privateHeaders } from '@/lib/private-request';
import { municipalities } from '@/lib/birthplace-catalog';
export const runtime = 'nodejs';

async function handleGET(request: Request) {
  try {
    const session = await currentSession();
    if (!session)
      return Response.json(
        { error: 'Entre novamente para continuar.' },
        { status: 401, headers: privateHeaders },
      );
    const state = new URL(request.url).searchParams.get('uf') ?? '';
    const cities = municipalities(state);
    if (!cities.length)
      return Response.json(
        { error: 'Selecione um estado da lista.' },
        { status: 422, headers: privateHeaders },
      );
    return Response.json({ cities }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: 'Não foi possível carregar os municípios. Tente novamente.' },
      { status: 503, headers: privateHeaders },
    );
  }
}
export const GET = withApiCanonicalPath(handleGET);
