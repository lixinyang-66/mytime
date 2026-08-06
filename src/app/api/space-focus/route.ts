import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getWeekEnd, getWeekStart, toDateKey } from '@/lib/date';
import { deriveProjectStatus } from '@/lib/project-status';
import { getSupabaseAdmin } from '@/lib/supabase';

function isMissingFocusTables(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string };
  return details.code === '42P01' || details.code === 'PGRST205'
    || details.message?.includes('space_focus_') === true;
}

function getMinutesBetween(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  return Math.max(0, (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes));
}

function currentPhaseFor(projectId: number, phases: Array<{ project_id: number; start_date: string; end_date: string; status: string; sort_order: number }>, today: string) {
  const projectPhases = phases.filter((phase) => phase.project_id === projectId);
  return projectPhases.find((phase) => phase.status === 'in_progress')
    || projectPhases.find((phase) => phase.start_date <= today && phase.end_date >= today)
    || projectPhases.find((phase) => phase.status === 'pending')
    || projectPhases.at(-1)
    || null;
}

export async function GET() {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const now = new Date();
  const weekStart = toDateKey(getWeekStart(now));
  const weekEnd = toDateKey(getWeekEnd(now));
  const today = toDateKey(now);

  try {
    const supabase = getSupabaseAdmin();
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id,name,status,start_date,end_date')
      .eq('space_id', auth.spaceId)
      .order('created_at', { ascending: false });
    if (projectsError) throw projectsError;

    const projectIds = (projects || []).map((project) => project.id);
    const [planResult, phasesResult, sessionsResult, reviewResult] = await Promise.all([
      supabase
        .from('space_focus_plans')
        .select('*')
        .eq('space_id', auth.spaceId)
        .eq('week_start_date', weekStart)
        .maybeSingle(),
      projectIds.length
        ? supabase.from('project_phases').select('id,project_id,name,start_date,end_date,status,sort_order').in('project_id', projectIds).order('sort_order')
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabase.from('study_sessions').select('id,project_id,phase_id,study_date,duration_minutes,content,outcome_status,created_at').in('project_id', projectIds).gte('study_date', weekStart).lte('study_date', weekEnd).order('created_at', { ascending: false }).limit(100)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('space_weekly_reviews').select('*').eq('space_id', auth.spaceId).eq('week_start_date', weekStart).maybeSingle(),
    ]);
    if (planResult.error) throw planResult.error;
    if (phasesResult.error) throw phasesResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    if (reviewResult.error) throw reviewResult.error;

    const plan = planResult.data;
    const { data: items, error: itemsError } = plan
      ? await supabase.from('space_focus_items').select('*').eq('space_focus_plan_id', plan.id).order('sort_order')
      : { data: [], error: null };
    if (itemsError) throw itemsError;

    const phaseList = phasesResult.data || [];
    const focusedProjectIds = new Set((items || []).map((item) => item.project_id));
    const projectsWithPhase = (projects || []).map((project) => {
      const projectPhases = phaseList.filter((phase) => phase.project_id === project.id);
      return {
        ...project,
        status: deriveProjectStatus(projectPhases, focusedProjectIds.has(project.id)),
        current_phase: currentPhaseFor(project.id, phaseList, today),
      };
    });
    const projectById = new Map(projectsWithPhase.map((project) => [project.id, project]));
    const focusItems = (items || []).map((item) => ({ ...item, project: projectById.get(item.project_id) || null }));
    const sessionRows = (sessionsResult.data || []).map((session) => ({
      ...session,
      project: projectById.get(session.project_id) || null,
    }));
    const availableMinutes = plan ? getMinutesBetween(plan.daily_start_time, plan.daily_end_time) : 0;
    const allocatedMinutes = focusItems.reduce((sum, item) => sum + Number(item.daily_minutes || 0), 0);

    return Response.json({
      weekStart,
      weekEnd,
      plan,
      items: focusItems,
      projects: projectsWithPhase,
      sessions: sessionRows,
      review: reviewResult.data || null,
      availableMinutes,
      allocatedMinutes,
    });
  } catch (error) {
    if (isMissingFocusTables(error)) {
      return Response.json({ error: '需要先执行 V2.3 空间专注数据库迁移。', migrationRequired: true }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : '读取本周专注数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const dailyStartTime = String(body.dailyStartTime || '').trim();
  const dailyEndTime = String(body.dailyEndTime || '').trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const uniqueItems = new Map<number, number>();
  for (const item of rawItems) {
    const projectId = Number(item?.projectId || 0);
    const dailyMinutes = Math.round(Number(item?.dailyMinutes || 0));
    if (projectId && dailyMinutes > 0) uniqueItems.set(projectId, dailyMinutes);
  }
  if (!/^\d{2}:\d{2}$/.test(dailyStartTime) || !/^\d{2}:\d{2}$/.test(dailyEndTime)) {
    return Response.json({ error: '请填写有效的每日开始和结束时间。' }, { status: 400 });
  }
  const availableMinutes = getMinutesBetween(dailyStartTime, dailyEndTime);
  const allocatedMinutes = Array.from(uniqueItems.values()).reduce((sum, minutes) => sum + minutes, 0);
  if (!availableMinutes || allocatedMinutes > availableMinutes) {
    return Response.json({ error: '项目分配时间不能超过每天可专注时间。' }, { status: 400 });
  }

  const now = new Date();
  const weekStart = toDateKey(getWeekStart(now));
  const weekEnd = toDateKey(getWeekEnd(now));
  try {
    const supabase = getSupabaseAdmin();
    const projectIds = Array.from(uniqueItems.keys());
    if (projectIds.length) {
      const { data: projects, error: projectsError } = await supabase
        .from('projects').select('id').eq('space_id', auth.spaceId).in('id', projectIds);
      if (projectsError) throw projectsError;
      if ((projects || []).length !== projectIds.length) return Response.json({ error: '本周项目中包含无权访问或已结束的项目。' }, { status: 400 });
    }

    const { data: plan, error: planError } = await supabase
      .from('space_focus_plans')
      .upsert({
        space_id: auth.spaceId,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        daily_start_time: dailyStartTime,
        daily_end_time: dailyEndTime,
      }, { onConflict: 'space_id,week_start_date' })
      .select('*')
      .single();
    if (planError || !plan) throw planError || new Error('保存本周专注时间失败。');

    const { error: deleteError } = await supabase.from('space_focus_items').delete().eq('space_focus_plan_id', plan.id);
    if (deleteError) throw deleteError;
    if (projectIds.length) {
      const { error: insertError } = await supabase.from('space_focus_items').insert(
        projectIds.map((projectId, index) => ({
          space_focus_plan_id: plan.id,
          project_id: projectId,
          daily_minutes: uniqueItems.get(projectId),
          sort_order: index + 1,
        })),
      );
      if (insertError) throw insertError;
    }
    return Response.json({ plan });
  } catch (error) {
    if (isMissingFocusTables(error)) {
      return Response.json({ error: '需要先执行 V2.3 空间专注数据库迁移。', migrationRequired: true }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : '保存本周专注计划失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
