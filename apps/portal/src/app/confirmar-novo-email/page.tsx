import { notFound } from 'next/navigation';
import { AccountConfirmEmail } from '@/components/account-confirm-email';
import PortalHome from '@/components/portal-home';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Confirmar novo e-mail | ETE CONECTADA' };

export default async function AccountConfirmEmailPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const session = await currentSession();
  return (
    <PortalHome
      studentName={session?.fullName ?? null}
      role={session?.role}
      internalPage
    >
      <section className="document-page" aria-labelledby="confirm-email-title">
        <h1 id="confirm-email-title">Confirmar novo e-mail</h1>
        <AccountConfirmEmail signedIn={Boolean(session)} />
      </section>
    </PortalHome>
  );
}
