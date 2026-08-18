import { requireSpaceAuthResponse } from '@/lib/auth';
import { getWeekStart, toDateKey } from '@/lib/date';
import { deriveProjectStatus } from '@/lib/project-status';
import { isMissingProjectProgressTable } from '@/lib/project-progress';
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
      .select('id,name,slug,start_date,end_date,status,difficulty,project_type,project_subtype,initial_status_note')
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

    const weekStart = toDateKey(getWeekStart(new Date()));
    const { data: currentFocusPlan, error: focusPlanError } = await supabase
      .from('space_focus_plans')
      .select('id')
      .eq('space_id', auth.spaceId)
      .eq('week_start_date', weekStart)
      .maybeSingle();
    if (focusPlanError && focusPlanError.code !== '42P01' && focusPlanError.code !== 'PGRST205') throw focusPlanError;
    const { data: currentFocusItems, error: focusItemsError } = currentFocusPlan
      ? await supabase.from('space_focus_items').select('project_id').eq('space_focus_plan_id', currentFocusPlan.id)
      : { data: [], error: null };
    if (focusItemsError) throw focusItemsError;
    const focusedProjectIds = new Set((currentFocusItems || []).map((item) => item.project_id));

    const { data: progressAssessments, error: progressError } = projectIds.length
      ? await supabase.from('project_progress_assessments').select('*').in('project_id', projectIds)
      : { data: [], error: null };
    if (progressError && !isMissingProjectProgressTable(progressError)) throw progressError;

    const phasesByProject = new Map<number, typeof projectPhases>();
    for (const phase of projectPhases || []) {
      phasesByProject.set(phase.project_id, [...(phasesByProject.get(phase.project_id) || []), phase]);
    }
    // 项目标签来自本周推进计划与实际阶段完成状态，不读取创建时的初始状态文字。
    const projectsWithDerivedStatus = (projects || []).map((project) => ({
      ...project,
      status: deriveProjectStatus(phasesByProject.get(project.id) || [], focusedProjectIds.has(project.id)),
    }));

    const { data: moods, error: moodsError } = await supabase
      .from('space_moods')
      .select('id,space_id,mood_date,mood_key,created_at,updated_at')
      .eq('space_id', auth.spaceId)
      .order('mood_date', { ascending: false });

    if (moodsError && !isMissingMoodTable(moodsError)) throw moodsError;

    return Response.json({
      space,
      projects: projectsWithDerivedStatus,
      projectPhases: projectPhases || [],
      moods: moods || [],
      progressAssessments: progressAssessments || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取空间数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
