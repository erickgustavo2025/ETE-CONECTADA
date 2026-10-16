import { resetOrigin } from './password-reset-input';

export function recoveryMailer() {
  const apiKey = process.env.RESEND_API_KEY,
    from = process.env.EMAIL_FROM;
  const origin = resetOrigin(process.env.PORTAL_PUBLIC_URL);
  if (!apiKey || !from || !origin) return null;
  async function send(to: string, subject: string, html: string) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Serviço de recuperação indisponível.');
  }
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
