import PasswordRecovery from '@/components/password-recovery';
export const metadata = {
  title: 'Recuperar acesso | ETE CONECTADA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function RecoveryPage() {
  return <PasswordRecovery key="request" mode="request" />;
}
