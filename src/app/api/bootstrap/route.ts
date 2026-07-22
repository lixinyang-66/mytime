import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

// GET: 获取当前空间的引导数据（空间信息 + 项目列表）
export async function GET() {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  try {
    const supabase = getSupabaseAdmin();

    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('id,name,created_at')
      .eq('id', auth.spaceId)
      .single();
    if (spaceError) throw spaceError;

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id,name,slug,start_date,end_date,status,difficulty')
      .eq('space_id', auth.spaceId)
      .order('created_at', { ascending: false });
    if (projectsError) throw projectsError;

    return Response.json({ space, projects: projects || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取空间数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
