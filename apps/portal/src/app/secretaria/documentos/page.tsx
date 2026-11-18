import { notFound, redirect } from 'next/navigation';
import { currentSession } from '@/lib/session';
import { canManageDeclarations } from '@/lib/declaration-access';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
export default async function DocumentsPage() {
  if (!declarationPortalEnabled()) notFound();
  const session = await currentSession();
  if (!session) redirect('/login');
  if (!canManageDeclarations(session.role)) notFound();
  redirect('/secretaria/declaracoes');
}
