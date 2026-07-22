import { NextRequest } from 'next/server';
import { hashPassword, setSpaceAuthCookie } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const spaceId = Number(body.spaceId || 0);
  const password = String(body.password || '');

  if (!spaceId || !password) {
    return Response.json({ error: '请选择空间并输入空间密码。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('spaces').select('id,password_hash').eq('id', spaceId).single();
    if (error) throw error;
    if (!data) {
      return Response.json({ error: '空间不存在。' }, { status: 404 });
    }

    const inputHash = hashPassword(password);
    if (data.password_hash === 'migrated_needs_password') {
      const { error: updateError } = await supabase.from('spaces').update({ password_hash: inputHash }).eq('id', spaceId);
      if (updateError) throw updateError;
    } else if (data.password_hash !== inputHash) {
      return Response.json({ error: '空间密码错误。' }, { status: 401 });
    }

    setSpaceAuthCookie(spaceId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
