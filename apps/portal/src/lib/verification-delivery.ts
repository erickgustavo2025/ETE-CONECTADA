import {
  emailProviderConfigured,
  emailTransport,
  type MailFetch,
} from './email-transport';
import { verificationUrl } from './portal-origin';

export function verificationDelivery(
  token: string,
  env: Record<string, string | undefined> = process.env,
  fetcher?: MailFetch,
) {
  const url = verificationUrl(token, env);
  if (!url) return null;
  // Só a demonstração sem provedor oferece link local. Falhas não usam esse caminho.
  if (env.NODE_ENV === 'development' && !emailProviderConfigured(env))
    return {
      async send() {
        return { result: 'dev_link' as const, verificationUrl: url };
      },
    };
  const transport = emailTransport(env, fetcher);
  if (!transport) return null;
  return {
    async send(to: string) {
      await transport.send(
        to,
        'Confirme seu e-mail | ETE CONECTADA',
        `<p>Para confirmar o e-mail do portal, acesse o link abaixo. Ele expira em 30 minutos.</p><p><a href="${url}">Confirmar meu e-mail</a></p>`,
      );
      return { result: 'email_sent' as const };
    },
  };
}
