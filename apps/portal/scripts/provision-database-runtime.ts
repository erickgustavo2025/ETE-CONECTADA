import { Client } from 'pg';
import { assignPortalDatabaseGrants } from './database-runtime-grants';

// Comando administrativo. A senha do papel é gerenciada fora do projeto.
async function main() {
  const [role, ...extra] = process.argv.slice(2);
  const connectionString = process.env.DIRECT_URL;
  if (!role || extra.length || !connectionString) {
    console.error(
      'Informe DIRECT_URL no ambiente de manutenção e o nome do papel do portal.',
    );
    process.exitCode = 2;
    return;
  }
  const admin = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await admin.connect();
    await assignPortalDatabaseGrants(admin, role);
    console.log('Privilégios do portal aplicados ao papel indicado.');
  } finally {
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    'Falha ao preparar o papel do portal. Verifique o banco migrado, a credencial de manutenção e o papel indicado.',
  );
  process.exitCode = 1;
});
