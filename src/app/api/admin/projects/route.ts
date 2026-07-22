import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);
  const adminPassword = String(body.adminPassword || '');
  const expectedPassword = process.env.DEVELOPER_ADMIN_PASSWORD;

  if (!expectedPassword) {
    return Response.json({ error: '服务端未配置 DEVELOPER_ADMIN_PASSWORD。' }, { status: 500 });
  }

  if (!projectId) {
    return Response.json({ error: '请选择要删除的项目。' }, { status: 400 });
  }

  if (!adminPassword || adminPassword !== expectedPassword) {
    return Response.json({ error: '开发者管理密码不正确。' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属当前空间
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限。' }, { status: 404 });
    }

    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
