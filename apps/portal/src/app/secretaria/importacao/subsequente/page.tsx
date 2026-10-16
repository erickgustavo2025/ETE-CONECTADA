import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import SchoolImport from '@/components/school-import';
import { currentSession } from '@/lib/session';

export const metadata = {
  title: 'Secretaria — Importação do subsequente | ETE CONECTADA',
};
export default async function SubsequentImportPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      {session.role === 'secretary' ? (
        <SchoolImport key="SUBSEQUENTE" mode="SUBSEQUENTE" />
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
