import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
import {
  readAccessBody,
  boundedString,
  validAccessPassword,
} from '@/lib/access-input';
import { NextResponse } from 'next/server';
import {
  consumeAccessAttempt,
  accessLimitResponse,
  clearLoginAttempts,
} from '@/lib/access-throttle';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createVerifiedSession } from '@/lib/session-record';
import { hashSessionToken, sessionDurationSeconds } from '@/lib/session';

import { sessionCookiePolicy } from '@/lib/session-cookie';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Fluxo de desenvolvimento definido pela equipe; produção continua bloqueada.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Acesso indisponível.' },
      { status: 404 },
    );
  }

  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );

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
    const db = getDb();
    const normalizedIdentifier = value.includes('@')
      ? value.toLowerCase()
      : cpf;
    const limit = accessLimitResponse(
      await consumeAccessAttempt(db, 'login', normalizedIdentifier),
    );
    if (limit) return limit;
    const started = performance.now();
    const row = await getDb().account.findFirst({
      where: {
        status: 'active',
        ...(value.includes('@')
          ? { email: { equals: value, mode: 'insensitive' as const } }
          : { student: { cpf } }),
      },
      select: {
        id: true,
        passwordHash: true,
        email: true,
        student: { select: { cpf: true } },
      },
    });
    const lookupFinished = performance.now();
    if (row) {
      const accountLimit = accessLimitResponse(
        await consumeAccessAttempt(db, 'login-account', row.id),
      );
      if (accountLimit) return accountLimit;
    }
    // Ausente/inativo também executa scrypt: a resposta não pula o trabalho de senha.
    const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
    const valid = await verifyPassword(
      password,
      row?.passwordHash || dummyHash,
    );
    const passwordFinished = performance.now();
    if (!row || !valid) {
      return NextResponse.json(
        {
          error: 'Não foi possível entrar. Confira os dados e tente novamente.',
        },
        { status: 401 },
      );
    }

    const token = randomBytes(32).toString('base64url');
    const created = await createVerifiedSession(
      getDb(),
      row!.id,
      row!.passwordHash!,
      hashSessionToken(token),
      new Date(Date.now() + sessionDurationSeconds * 1000),
    );
    if (!created)
      return NextResponse.json(
        {
          error: 'Não foi possível entrar. Confira os dados e tente novamente.',
        },
        { status: 401 },
      );
    await db.$transaction((tx) =>
      clearLoginAttempts(tx, {
        id: row.id,
        email: row.email,
        cpf: row.student.cpf,
      }),
    );
    const sessionFinished = performance.now();
    const response = NextResponse.json({ ok: true });
    const cookie = sessionCookiePolicy();
    response.cookies.set(cookie.name, token, cookie.options);
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
