import PasswordRecovery from '@/components/password-recovery';
export const metadata = {
  title: 'Redefinir senha | ETE CONECTADA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string | string[] }>;
}) {
  const invite = (await searchParams).convite === '1';
  return (
    <PasswordRecovery
      key={invite ? 'invite' : 'reset'}
      mode={invite ? 'invite' : 'reset'}
    />
  );
}
