import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import IntegratedImport from '@/components/integrated-import';
import { currentSession } from '@/lib/session';

export const metadata = {
  title: 'Secretaria — Importação do integrado | ETE CONECTADA',
};
export default async function IntegratedImportPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      {session.role === 'secretary' ? (
        <IntegratedImport />
      ) : (
        <section className="document-page">
          <h1>Acesso restrito à secretaria</h1>
          <p>Somente a secretaria pode importar dados escolares.</p>
          <a className="ete-button" href="/">
            Página inicial
          </a>
        </section>
      )}
    </PortalHome>
  );
}
