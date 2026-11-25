import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import { AccountEmailForm } from '@/components/account-email-form';
import { AccountPasswordForm } from '@/components/account-password-form';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Minha conta | ETE CONECTADA' };

export default async function AccountPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      <section className="document-page" aria-labelledby="account-title">
        <h1 id="account-title">Minha conta</h1>
        <AccountPasswordForm />
        {session.role === 'student' ? (
          <AccountEmailForm email={session.email} />
        ) : (
          <>
            <h2>E-mail de acesso</h2>
            <p>{session.email}</p>
            <p>Para atualizar esse endereço, procure a gestão da escola.</p>
          </>
        )}
      </section>
    </PortalHome>
  );
}
