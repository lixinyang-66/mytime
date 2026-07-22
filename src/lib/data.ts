import type { Project, ProjectPhase, StudySession, TaskBoard, WeeklyPlan, WeeklyPlanItem } from '@/types';
import { getWeekEnd, getWeekStart, toDateKey } from './date';
import { getSupabaseAdmin } from './supabase';
import { buildStats } from './stats';

export async function getProjectData(projectId: number): Promise<{
  project: Project;
  phases: ProjectPhase[];
  taskBoards: TaskBoard[];
  currentPlan: WeeklyPlan | null;
  currentPlanItems: WeeklyPlanItem[];
  recentSessions: StudySession[];
  stats: ReturnType<typeof buildStats>;
}> {
  const supabase = getSupabaseAdmin();
  const weekStart = toDateKey(getWeekStart());
  const weekEnd = toDateKey(getWeekEnd());

  const [projectResult, phasesResult, boardsResult, planResult, sessionsResult, recentResult] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('project_phases').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }),
    supabase.from('task_boards').select('*').eq('project_id', projectId).eq('is_custom', true).order('sort_order', { ascending: true }),
    supabase
      .from('weekly_plans')
      .select('*, weekly_plan_items(*, task_board:task_boards(*))')
      .eq('project_id', projectId)
      .lte('week_start_date', weekEnd)
      .gte('week_end_date', weekStart)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('study_sessions')
      .select('*, task_board:task_boards(*)')
      .eq('project_id', projectId)
      .order('study_date', { ascending: false })
      .limit(500),
    supabase
      .from('study_sessions')
      .select('*, task_board:task_boards(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (projectResult.error) throw new Error(`projects: ${projectResult.error.message}`);
  if (phasesResult.error) throw new Error(`project_phases: ${phasesResult.error.message}`);
  if (boardsResult.error) throw new Error(`task_boards: ${boardsResult.error.message}`);
  if (planResult.error) throw new Error(`weekly_plans: ${planResult.error.message}`);
  if (sessionsResult.error) throw new Error(`study_sessions: ${sessionsResult.error.message}`);
  if (recentResult.error) throw new Error(`recent study_sessions: ${recentResult.error.message}`);

  const project = projectResult.data as Project;
  const phases = (phasesResult.data || []) as ProjectPhase[];
  const taskBoards = (boardsResult.data || []) as TaskBoard[];
  const currentPlan = planResult.data ? ({ ...planResult.data, weekly_plan_items: undefined } as WeeklyPlan) : null;
  const currentPlanItems = planResult.data?.weekly_plan_items
    ? (planResult.data.weekly_plan_items as WeeklyPlanItem[]).filter((item) => item.task_board?.is_custom)
    : [];
  const sessions = ((sessionsResult.data || []) as StudySession[]).filter((item) => item.task_board?.is_custom);
  const recentSessions = ((recentResult.data || []) as StudySession[]).filter((item) => item.task_board?.is_custom);

  return {
    project,
    phases,
    taskBoards,
    currentPlan,
    currentPlanItems,
    recentSessions,
    stats: buildStats(sessions, currentPlanItems),
  };
}
