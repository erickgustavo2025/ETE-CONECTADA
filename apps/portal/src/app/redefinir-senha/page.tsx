import PasswordRecovery from '@/components/password-recovery';
export const metadata = {
  title: 'Redefinir senha | ETE CONECTADA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function ResetPage() {
  return <PasswordRecovery key="reset" mode="reset" />;
}
