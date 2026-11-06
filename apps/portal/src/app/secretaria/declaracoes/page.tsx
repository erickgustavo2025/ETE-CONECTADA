import { notFound, redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import DocumentRegistry from '@/components/document-registry';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
import { canManageDeclarations } from '@/lib/declaration-access';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Declarações dos alunos | ETE CONECTADA' };
export default async function SecretaryDeclarationsPage() {
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
