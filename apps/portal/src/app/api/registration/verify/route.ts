import { createHash } from 'node:crypto';
import { verifyAccount, RegistrationConflict } from '@/lib/account-registration';
import { databaseErrorResponse, disabledResponse, registrationEnabled } from '@/lib/registration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Link inválido.' }, { status: 400 }); }
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(body.token)) return Response.json({ error: 'Link inválido.' }, { status: 400 });
  const hash = createHash('sha256').update(body.token).digest('hex');
  try {
    await verifyAccount(hash);
    return Response.json({ result: 'verified' });
  } catch (error) {
    if (error instanceof RegistrationConflict) {
      return Response.json({ error: error.reason === 'invalid'
        ? 'Este link é inválido ou expirou.' : 'Este link não pode mais ser usado.' }, { status: 400 });
    }
    return databaseErrorResponse();
  }
}
