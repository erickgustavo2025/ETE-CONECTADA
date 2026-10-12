import {
  readAccessBody,
  boundedString,
  validAccessPassword,
} from '@/lib/access-input';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import {
  hashSessionToken,
  sessionCookieName,
  sessionDurationSeconds,
} from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Fluxo de desenvolvimento definido pela equipe; produção continua bloqueada.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Acesso indisponível.' },
      { status: 404 },
    );
  }

  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const { identifier, password } = input.body;
  if (
    !boundedString(identifier, 320) ||
    !identifier.trim() ||
    !validAccessPassword(password)
  ) {
    return NextResponse.json(
      { error: 'Não foi possível entrar. Confira os dados e tente novamente.' },
      { status: 400 },
    );
  }

  const value = identifier.trim();
  const cpf = value.replace(/\D/g, '');
  try {
    const started = performance.now();
    const row = await getDb().account.findFirst({
      where: {
        status: 'active',
        ...(value.includes('@')
          ? { email: { equals: value, mode: 'insensitive' as const } }
          : { student: { cpf } }),
      },
      select: { id: true, passwordHash: true },
    });
    const lookupFinished = performance.now();
    const valid = row?.passwordHash
      ? await verifyPassword(password, row.passwordHash)
      : false;
    const passwordFinished = performance.now();
    if (!valid) {
      return NextResponse.json(
        {
          error: 'Não foi possível entrar. Confira os dados e tente novamente.',
        },
        { status: 401 },
      );
    }

    const token = randomBytes(32).toString('base64url');
    await getDb().session.create({
      data: {
        tokenHash: hashSessionToken(token),
        accountId: row!.id,
        expiresAt: new Date(Date.now() + sessionDurationSeconds * 1000),
      },
    });
    const sessionFinished = performance.now();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionDurationSeconds,
    });
    response.headers.set('Cache-Control', 'no-store');
    // Tempos de desenvolvimento, sem credenciais ou dados do aluno.
    response.headers.set(
      'Server-Timing',
      [
        `lookup;dur=${(lookupFinished - started).toFixed(1)}`,
        `password;dur=${(passwordFinished - lookupFinished).toFixed(1)}`,
        `session;dur=${(sessionFinished - passwordFinished).toFixed(1)}`,
      ].join(', '),
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível concluir o acesso agora. Tente novamente.' },
      { status: 503 },
    );
  }
}
