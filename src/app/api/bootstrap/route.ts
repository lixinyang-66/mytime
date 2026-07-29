import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

function isMissingMoodTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string };
  return details.code === '42P01' || details.code === 'PGRST205' || details.message?.includes('space_moods') === true;
}

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
      .select('id,name,slug,start_date,end_date,status,difficulty,project_type,project_subtype')
      .eq('space_id', auth.spaceId)
      .order('created_at', { ascending: false });
    if (projectsError) throw projectsError;

    const projectIds = (projects || []).map((project) => project.id);
    const { data: projectPhases, error: projectPhasesError } = projectIds.length
      ? await supabase
        .from('project_phases')
        .select('id,project_id,name,start_date,end_date,sort_order,status,progress')
        .in('project_id', projectIds)
        .order('sort_order', { ascending: true })
      : { data: [], error: null };
    if (projectPhasesError) throw projectPhasesError;

    const { data: moods, error: moodsError } = await supabase
      .from('space_moods')
      .select('id,space_id,mood_date,mood_key,created_at,updated_at')
      .eq('space_id', auth.spaceId)
      .order('mood_date', { ascending: false });

    if (moodsError && !isMissingMoodTable(moodsError)) throw moodsError;

    return Response.json({ space, projects: projects || [], projectPhases: projectPhases || [], moods: moods || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取空间数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
