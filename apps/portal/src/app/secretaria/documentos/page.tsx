import { notFound, redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import DocumentRegistry from '@/components/document-registry';
import { currentSession } from '@/lib/session';
import { canManageDeclarations } from '@/lib/declaration-access';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
export const metadata = { title: 'Histórico de documentos | ETE CONECTADA' };
export default async function DocumentRegistryPage() {
  if (!declarationRegistryPreviewEnabled()) notFound();
  const session = await currentSession();
  if (!session) redirect('/login');
  if (!canManageDeclarations(session.role)) notFound();
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      <DocumentRegistry />
    </PortalHome>
  );
}
