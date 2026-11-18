import { emailTransport } from './email-transport';

export function accountEmailMailer() {
  const transport = emailTransport();
  if (!transport) return null;

  const { origin, send } = transport;
  return {
    origin,
    confirmation: (to: string, url: string) =>
      send(
        to,
        'Confirme seu novo e-mail | ETE CONECTADA',
        `<p>Confirme que este e-mail pertence a você. O link vale por 30 minutos.</p><p><a href="${url}">Confirmar novo e-mail</a></p><p>Se você não solicitou a troca, ignore esta mensagem.</p>`,
      ),
    notify: (to: string) =>
      send(
        to,
        'Seu e-mail do portal foi alterado | ETE CONECTADA',
        '<p>O e-mail de acesso à sua conta foi alterado e as sessões anteriores foram encerradas.</p><p>Se você não reconhece a troca, procure a secretaria da escola.</p>',
      ),
  };
}
