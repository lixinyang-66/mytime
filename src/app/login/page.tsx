import { redirect } from 'next/navigation';
import { getAuthedSpaceId } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  if (getAuthedSpaceId()) {
    redirect('/');
  }

  return <LoginForm />;
}
