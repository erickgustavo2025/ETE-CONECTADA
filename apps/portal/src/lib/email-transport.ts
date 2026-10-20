import { configuredOrigin } from './portal-origin';

export type MailFetch = (url: string, init: RequestInit) => Promise<Response>;

export class MailDeliveryError extends Error {
  constructor() {
    super('Não foi possível enviar a mensagem agora. Tente novamente.');
  }
}

// Não repete o envio: um timeout pode acontecer depois de o provedor aceitá-lo.
export function emailTransport(
  env: Record<string, string | undefined> = process.env,
  fetcher: MailFetch = (url, init) => fetch(url, init),
) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const origin = configuredOrigin(env.PORTAL_PUBLIC_URL);
  if (
    !apiKey ||
    !from ||
    !origin ||
    (env.NODE_ENV !== 'development' && !origin.startsWith('https://'))
  )
    return null;
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
