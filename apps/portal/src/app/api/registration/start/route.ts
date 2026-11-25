import { withApiCanonicalPath } from '@/lib/api-route';
import { portalAccessEnabled } from '@/lib/portal-access';
import { verificationDelivery } from '@/lib/verification-delivery';
import { MailDeliveryError } from '@/lib/email-transport';
import { sameOriginRequest, privateHeaders } from '@/lib/private-request';
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
  validBirthDate,
  normalizeParentName,
} from '@/lib/registration';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  if (!portalAccessEnabled()) return disabledResponse();
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Solicitação não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
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
  const delivery = verificationDelivery(token);
  if (!delivery)
    return Response.json(
      {
        error: 'Não foi possível iniciar a confirmação agora. Tente novamente.',
      },
      { status: 503, headers: privateHeaders },
    );
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

    return Response.json(await delivery.send(email), {
      headers: privateHeaders,
    });
  } catch (error) {
    if (error instanceof MailDeliveryError)
      return Response.json(
        {
          error:
            'Não foi possível enviar a confirmação agora. Tente novamente com os mesmos dados.',
        },
        { status: 503, headers: privateHeaders },
      );
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

export const POST = withApiCanonicalPath(handlePOST);
