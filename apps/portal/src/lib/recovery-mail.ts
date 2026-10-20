import { emailTransport, type MailFetch } from './email-transport';

export function recoveryMailer(
  env: Record<string, string | undefined> = process.env,
  fetcher?: MailFetch,
) {
  const transport = emailTransport(env, fetcher);
  if (!transport) return null;
  const { origin, send } = transport;
  return {
    origin,
    send: (to: string, url: string) =>
      send(
        to,
        'Redefina sua senha | ETE CONECTADA',
        `<p>Você pode redefinir sua senha pelo link abaixo, válido por 30 minutos.</p><p><a href="${url}">Redefinir senha</a></p><p>Se não solicitou a alteração, ignore esta mensagem. Sua senha permanece a mesma.</p>`,
      ),
    notify: (to: string) =>
      send(
        to,
        'Sua senha foi alterada | ETE CONECTADA',
        '<p>A senha da sua conta foi alterada. As sessões anteriores foram encerradas.</p><p>Se você não reconhece essa alteração, procure a secretaria por um canal institucional.</p>',
      ),
  };
}
