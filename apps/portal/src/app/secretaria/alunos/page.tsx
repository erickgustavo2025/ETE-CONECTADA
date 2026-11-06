import { notFound, redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import StudentAdministration from '@/components/student-administration';
import { currentSession } from '@/lib/session';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
export const metadata = { title: 'Alunos e acesso | ETE CONECTADA' };
export default async function StudentsPage() {
  if (!declarationRegistryPreviewEnabled()) notFound();
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role !== 'secretary') notFound();
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      <StudentAdministration />
    </PortalHome>
  );
}
