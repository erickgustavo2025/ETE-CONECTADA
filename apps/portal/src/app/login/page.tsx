import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/session';
import LoginForm from '@/components/login-form';

export default async function LoginPage() {
  if (await currentSession()) redirect('/');
  return <LoginForm />;
}
