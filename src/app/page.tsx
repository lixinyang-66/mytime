import { redirect } from 'next/navigation';
import { getAuthedSpaceId } from '@/lib/auth';
import MyTimeApp from '@/components/SummerSprintApp';

export default function HomePage() {
  if (!getAuthedSpaceId()) {
    redirect('/login');
  }

  return <MyTimeApp />;
}
