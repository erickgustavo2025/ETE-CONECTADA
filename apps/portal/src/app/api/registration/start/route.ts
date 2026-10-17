import { getDb } from '@/lib/db';
import {
  consumeAccessAttempt,
  accessLimitResponse,
} from '@/lib/access-throttle';
import {
  readAccessBody,
  boundedString,
  validAccessPassword,
} from '@/lib/access-input';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { claimAccount, RegistrationConflict } from '@/lib/account-registration';
import { hashPassword } from '@/lib/password';
import {
  databaseErrorResponse,
  disabledResponse,
  normalizeCpf,
  normalizeSchoolRegistration,
  normalizeEmail,
  registrationEnabled,
  validBirthDate,
  normalizeParentName,
} from '@/lib/registration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!registrationEnabled) return disabledResponse();
  const input = await readAccessBody(request);
  if ('response' in input) return input.response;
  const body = input.body;
  if (
    !boundedString(body.schoolRegistration, 32) ||
    !boundedString(body.birthDate, 10) ||
    !boundedString(body.cpf, 32) ||
    !boundedString(body.email, 320) ||
    !validAccessPassword(body.password) ||
    !validAccessPassword(body.confirmPassword) ||
    !boundedString(body.parentName, 180) ||
    !normalizeParentName(body.parentName)
  )
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  const cpf = normalizeCpf(body.cpf);
  const schoolRegistration = normalizeSchoolRegistration(
    body.schoolRegistration,
  );
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!cpf)
    return Response.json(
      { error: 'Informe um CPF válido.', field: 'cpf' },
      { status: 400 },
    );
  if (!schoolRegistration || !validBirthDate(body.birthDate) || !email) {
    return Response.json(
      { error: 'Confira os dados e use uma senha de 8 a 128 caracteres.' },
      { status: 400 },
    );
  }
  if (body.confirmPassword !== password)
    return Response.json(
      { error: 'As senhas precisam ser iguais.', field: 'confirmPassword' },
      { status: 400 },
    );

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try {
    const limit = accessLimitResponse(
      await consumeAccessAttempt(getDb(), 'registration', schoolRegistration),
    );
    if (limit) return limit;
    const passwordHash = await hashPassword(password);
    await claimAccount({
      schoolRegistration,
      cpf,
      birthDate: new Date(`${body.birthDate}T00:00:00Z`),
      email,
      password,
      passwordHash,
      tokenHash,
      parentName: body.parentName,
    });

    const url = new URL('/confirmar-email', request.url);
    url.searchParams.set('token', token);
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (apiKey && from) {
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Confirme seu e-mail | ETE CONECTADA',
          html: `<p>Para confirmar o e-mail do portal, acesse o link abaixo. Ele expira em 30 minutos.</p><p><a href="${url.toString()}">Confirmar meu e-mail</a></p>`,
        }),
      });
      if (!sent.ok)
        return Response.json(
          {
            result: 'dev_link',
            verificationUrl: url.toString(),
            warning: 'O serviço de e-mail não aceitou a mensagem.',
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      return Response.json(
        { result: 'email_sent' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Link local para testar Neon sem depender de um provedor de e-mail ainda.
    return Response.json(
      {
        result: 'dev_link',
        verificationUrl: url.toString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof RegistrationConflict) {
      return Response.json(
        {
          error:
            error.reason === 'unmatched'
              ? 'Não foi possível confirmar os dados. Confira as informações ou procure a escola.'
              : error.reason === 'cpf'
                ? 'O CPF não corresponde ao informado anteriormente. Confira os dados ou procure a escola.'
                : error.reason === 'pending'
                  ? 'Há uma confirmação em andamento. Use o mesmo CPF, e-mail e senha para receber um novo link. Se não lembrar dos dados, tente novamente após o link expirar (até 30 minutos).'
                  : 'Esta conta já está ativa. Acesse a página de login.',
        },
        { status: error.reason === 'unmatched' ? 400 : 409 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return Response.json(
        {
          error:
            'Não foi possível usar este CPF ou e-mail. Confira se você já tem uma conta ou procure a escola.',
        },
        { status: 409 },
      );
    }
    return databaseErrorResponse();
  }
}
