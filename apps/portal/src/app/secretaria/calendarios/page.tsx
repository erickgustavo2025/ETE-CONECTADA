import { notFound, redirect } from 'next/navigation';
import { currentSession } from '@/lib/session';
export default async function PreviousCalendarPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role !== 'secretary') notFound();
  redirect('/secretaria/importacao/subsequente');
}
