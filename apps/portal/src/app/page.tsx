import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import PortalHome from '@/components/portal-home';
import { currentSession } from '@/lib/session';
import { crossAppDestination } from '../../../../shared/navigation/cross-app-destination';

export default async function HomePage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const development = process.env.NODE_ENV === 'development';
  const site = crossAppDestination(
    process.env.SITE_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL,
    {
      development,
      port: 3000,
      requestHost: development ? (await headers()).get('host') : null,
      lanHost: process.env.NEXT_PUBLIC_LAN_HOST,
    },
  );
  return (
    <PortalHome
      studentName={session.fullName}
      siteHref={site?.href}
      siteDevelopmentPort={site?.developmentPort}
      role={session.role}
    />
  );
}
