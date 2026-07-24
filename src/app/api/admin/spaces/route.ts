import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

function isAdminPasswordValid(adminPassword: string, expectedPassword: string): boolean {
  const provided = Buffer.from(adminPassword);
  const expected = Buffer.from(expectedPassword);

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const spaceId = Number(body.spaceId || 0);
  const adminPassword = String(body.adminPassword || '');
  const expectedPassword = process.env.DEVELOPER_ADMIN_PASSWORD;

  if (!expectedPassword) {
    return Response.json({ error: '服务端未配置 DEVELOPER_ADMIN_PASSWORD。' }, { status: 500 });
  }

  if (!Number.isInteger(spaceId) || spaceId <= 0) {
    return Response.json({ error: '请选择要删除的空间。' }, { status: 400 });
  }

  if (!adminPassword || !isAdminPasswordValid(adminPassword, expectedPassword)) {
    return Response.json({ error: '开发者管理密码不正确。' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('id,name')
      .eq('id', spaceId)
      .maybeSingle();

    if (spaceError) throw spaceError;
    if (!space) {
      return Response.json({ error: '空间不存在或已经被删除。' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('spaces')
      .delete()
      .eq('id', spaceId);

    if (deleteError) throw deleteError;

    return Response.json({ ok: true, deletedSpace: space });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除空间失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
