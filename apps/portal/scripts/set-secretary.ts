import { createInterface } from 'node:readline/promises';
import { emailTransport } from '../src/lib/email-transport';
import { portalAccessEnabled } from '../src/lib/portal-access';
import { openMaintenanceDatabase } from './database-maintenance';
import { changeStaffAccess, StaffAccessError } from './staff-access';

async function main() {
  const [action, ...extra] = process.argv.slice(2);
  const url = process.env.DIRECT_URL;
  if ((action !== 'invite' && action !== 'revoke') || extra.length || !url)
    throw new StaffAccessError(
      'Use invite ou revoke com DIRECT_URL no ambiente de manutenção.',
    );

  const transport = action === 'invite' ? emailTransport() : null;
  if (action === 'invite' && (!transport || !portalAccessEnabled()))
    throw new StaffAccessError(
      'Verifique a configuração de acesso, o remetente e o endereço do portal.',
    );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = await rl.question('E-mail da pessoa da secretaria: ');
    const name =
      action === 'invite' ? await rl.question('Nome completo: ') : '';
    const reason = await rl.question('Motivo da operação: ');
    const phrase = action === 'invite' ? 'CONVIDAR' : 'RETIRAR';
    if ((await rl.question(`Digite ${phrase} para confirmar: `)) !== phrase) {
      console.log('Operação cancelada.');
      return;
    }
    const db = openMaintenanceDatabase(url);
    try {
      await changeStaffAccess(
        db,
        { action, email, name, reason },
        transport
          ? {
              origin: transport.origin,
              send: (to, link) =>
                transport.send(
                  to,
                  'Acesso da secretaria | ETE CONECTADA',
                  `<p>A escola autorizou seu acesso à secretaria. O link vale por 30 minutos.</p><p><a href="${link}">Definir minha senha</a></p><p>Se não esperava receber este convite, procure a escola.</p>`,
                ),
            }
          : undefined,
      );
      console.log(
        action === 'invite'
          ? 'Convite enviado ao provedor de e-mail. Confirme o recebimento.'
          : 'Acesso retirado e sessões encerradas.',
      );
    } finally {
      await db.$disconnect();
    }
  } finally {
    rl.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof StaffAccessError
      ? error.message
      : 'Não foi possível concluir a operação.',
  );
  process.exitCode = 1;
});
