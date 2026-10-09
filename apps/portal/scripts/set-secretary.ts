import { config } from 'dotenv';
import { getDb } from '../src/lib/db';
import { normalizeEmail } from '../src/lib/registration';

config({ path: '.env.local', quiet: true });
async function main() {
  const email = normalizeEmail(process.argv[2]);
  if (!email) throw new Error('Informe o e-mail de uma conta ativa autorizada pela equipe.');
  const db = getDb();
  try {
    const account = await db.account.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!account || account.status !== 'active') throw new Error('A conta precisa existir e estar ativa.');
    await db.account.update({ where: { id: account.id }, data: { role: 'secretary' } });
    console.log('Acesso à secretaria atribuído à conta indicada.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Não foi possível atribuir acesso. Confira o e-mail da conta ativa e a conexão.'); process.exitCode = 1; });
