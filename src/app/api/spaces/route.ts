import { NextRequest } from 'next/server';
import { hashPassword, setSpaceAuthCookie } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

// GET: 列出所有空间
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('spaces')
      .select('id,name,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取空间失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: 创建新空间
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const password = String(body.password || '');

  if (!name || !password) {
    return Response.json({ error: '请填写空间名称和密码。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: space, error } = await supabase
      .from('spaces')
      .insert({ name, password_hash: hashPassword(password) })
      .select('id,name,created_at')
      .single();
    if (error) throw error;
    return Response.json(space);
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建空间失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
