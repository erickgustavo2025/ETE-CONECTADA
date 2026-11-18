import { createTransport } from 'nodemailer';
import { configuredOrigin } from './portal-origin';

export const smtpSettings = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_TLS_MODE',
  'SMTP_USER',
  'SMTP_PASSWORD',
] as const;

type Environment = Record<string, string | undefined>;

export function emailProviderConfigured(env: Environment) {
  return Boolean(
    env.EMAIL_TRANSPORT ||
    env.EMAIL_FROM ||
    env.RESEND_API_KEY ||
    smtpSettings.some((key) => env[key]),
  );
}

export type MailFetch = (url: string, init: RequestInit) => Promise<Response>;

export class MailDeliveryError extends Error {
  constructor() {
    super('Não foi possível enviar a mensagem agora. Tente novamente.');
  }
}

// Não repete o envio: um timeout pode acontecer depois de o provedor aceitá-lo.
export function emailTransport(
  env: Environment = process.env,
  fetcher: MailFetch = (url, init) => fetch(url, init),
) {
  const origin = configuredOrigin(env.PORTAL_PUBLIC_URL);
  const from = env.EMAIL_FROM?.trim();
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !origin ||
    (env.NODE_ENV !== 'development' && !origin.startsWith('https://'))
  )
    return null;

  const method = env.EMAIL_TRANSPORT?.trim() || 'resend';
  if (method === 'smtp') return smtpTransport(env, origin, from);
  if (method !== 'resend') return null;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    origin,
    async send(to: string, subject: string, html: string) {
      try {
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          credentials: 'omit',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to: [to], subject, html }),
          signal: AbortSignal.timeout(5000),
        });
        // O corpo do provedor não participa das respostas ou dos registros locais.
        await response.body?.cancel();
        if (!response.ok) throw new MailDeliveryError();
      } catch {
        throw new MailDeliveryError();
      }
    },
  };
}

function smtpTransport(env: Environment, origin: string, from: string) {
  const host = env.SMTP_HOST?.trim();
  const portText = env.SMTP_PORT?.trim() || '587';
  const port = Number(portText);
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;
  const tlsMode =
    env.SMTP_TLS_MODE?.trim() || (port === 465 ? 'implicit' : 'starttls');

  if (
    !host ||
    host.length > 253 ||
    !host
      .split('.')
      .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)) ||
    !/^\d{1,5}$/.test(portText) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !pass?.trim() ||
    (tlsMode !== 'implicit' && tlsMode !== 'starttls')
  )
    return null;

  const transport = createTransport({
    host,
    port,
    auth: { user, pass },
    secure: tlsMode === 'implicit',
    requireTLS: tlsMode === 'starttls',
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 4000,
    dnsTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return {
    origin,
    async send(to: string, subject: string, html: string) {
      try {
        const result = await transport.sendMail({
          from,
          to: { name: '', address: to },
          subject,
          html,
        });
        if (result.accepted.length !== 1) throw new MailDeliveryError();
      } catch {
        // Falhas do servidor não entram na resposta do portal.
        throw new MailDeliveryError();
      }
    },
  };
}
