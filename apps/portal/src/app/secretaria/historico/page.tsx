import { notFound, redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import { AuditHistory } from '@/components/audit-history';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Histórico de ações | ETE CONECTADA' };

export default async function SecretaryAuditPage() {
  if (!declarationPortalEnabled()) notFound();
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role !== 'secretary') notFound();
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      <AuditHistory />
    </PortalHome>
  );
}
