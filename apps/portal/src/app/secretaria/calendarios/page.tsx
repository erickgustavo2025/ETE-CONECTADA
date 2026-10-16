import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import CourseCalendars from '@/components/course-calendars';
import { currentSession } from '@/lib/session';
export const metadata = { title: 'Calendário do subsequente | ETE CONECTADA' };
export default async function CalendarPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      {session.role === 'secretary' ? (
        <CourseCalendars />
      ) : (
        <section className="document-page">
          <h1>Acesso restrito à secretaria</h1>
          <p>Somente a secretaria pode administrar calendários escolares.</p>
        </section>
      )}
    </PortalHome>
  );
}
