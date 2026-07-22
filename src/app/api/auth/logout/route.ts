import { clearSpaceAuthCookie } from '@/lib/auth';

export async function POST() {
  clearSpaceAuthCookie();
  return Response.json({ ok: true });
}
