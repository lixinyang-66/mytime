import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { generatePersonalizedReview } from '@/lib/ai';
import { getWeekEnd, getWeekStart, toDateKey } from '@/lib/date';
import { getMoodByKey } from '@/lib/moods';
import { getSupabaseAdmin } from '@/lib/supabase';

// 基于同一空间的真实专注记录与每日状态生成周复盘；不会在每次专注结束时自动调用 AI。
export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);
  if (!projectId) return Response.json({ error: '缺少项目 ID。' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) return Response.json({ error: '项目不存在或无权访问。' }, { status: 404 });

    const now = new Date();
    const periodStart = toDateKey(getWeekStart(now));
    const periodEnd = toDateKey(getWeekEnd(now));
    const { data: focusPlan, error: focusPlanError } = await supabase
      .from('space_focus_plans')
      .select('id')
      .eq('space_id', auth.spaceId)
      .eq('week_start_date', periodStart)
      .maybeSingle();
    if (focusPlanError) throw focusPlanError;
    const { data: focusItems, error: focusItemsError } = focusPlan
      ? await supabase.from('space_focus_items').select('project_id,daily_minutes').eq('space_focus_plan_id', focusPlan.id)
      : { data: [], error: null };
    if (focusItemsError) throw focusItemsError;
    const projectDailyTarget = Number((focusItems || []).find((item) => item.project_id === projectId)?.daily_minutes || 0);
    const historyStartDate = getWeekStart(now);
    historyStartDate.setDate(historyStartDate.getDate() - 56);
    const historyStart = toDateKey(historyStartDate);
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id,name,status,sort_order,start_date,end_date')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    const phaseList = phases || [];
    const phaseById = new Map(phaseList.map((phase) => [phase.id, phase.name]));
    const currentPhase = phaseList.find((phase) => phase.status === 'in_progress')
      || phaseList.find((phase) => phase.start_date <= toDateKey(now) && phase.end_date >= toDateKey(now))
      || phaseList.find((phase) => phase.status === 'pending')
      || phaseList.at(-1);

    // 同一空间的项目记录可反映整体负荷；复盘建议仍优先围绕当前项目给出。
    const { data: spaceProjects } = await supabase
      .from('projects')
      .select('id,name')
      .eq('space_id', auth.spaceId);
    const projectNames = new Map((spaceProjects || []).map((item) => [item.id, item.name]));
    const projectIds = (spaceProjects || []).map((item) => item.id);
    const { data: sessions, error: sessionsError } = projectIds.length
      ? await supabase
        .from('study_sessions')
        .select('project_id,phase_id,study_date,duration_minutes,content,outcome_status')
        .in('project_id', projectIds)
        .gte('study_date', historyStart)
        .lte('study_date', periodEnd)
        .order('study_date', { ascending: true })
        .limit(100)
      : { data: [], error: null };
    if (sessionsError) throw sessionsError;

    const { data: moods, error: moodsError } = await supabase
      .from('space_moods')
      .select('mood_date,mood_key')
      .eq('space_id', auth.spaceId)
      .gte('mood_date', periodStart)
      .lte('mood_date', periodEnd)
      .order('mood_date', { ascending: true });
    if (moodsError) throw moodsError;

    const weeklySessions = (sessions || []).filter((item) => item.study_date >= periodStart);
    const historyMinutes = (sessions || []).reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0);
    const historyByProject = new Map<number, number>();
    for (const item of sessions || []) {
      historyByProject.set(item.project_id, (historyByProject.get(item.project_id) || 0) + Number(item.duration_minutes || 0));
    }
    const historyText = (sessions || []).length
      ? `近 8 周共 ${sessions?.length} 次专注、${historyMinutes} 分钟；按项目投入：${Array.from(historyByProject.entries()).map(([id, minutes]) => `${projectNames.get(id) || '项目'} ${minutes} 分钟`).join('，')}。`
      : '近 8 周暂无专注记录。';

    const review = await generatePersonalizedReview({
      projectName: project.name,
      projectGoal: project.goal || project.total_goal || '未填写',
      projectType: project.project_type || 'general',
      projectSubtype: project.project_subtype,
      reviewScope: 'project',
      periodStart,
      periodEnd,
      currentPhase: currentPhase?.name,
      dailyTargetMinutes: projectDailyTarget,
      dailyPlanDescription: projectDailyTarget ? `${project.name} ${projectDailyTarget} 分钟/天` : '本周未将该项目加入推进项目。',
      sessions: weeklySessions.filter((item) => item.project_id === projectId).map((item) => ({
        studyDate: item.study_date,
        durationMinutes: Number(item.duration_minutes || 0),
        content: `${projectNames.get(item.project_id) || '项目'}：${item.content || '未填写结果'}`,
        outcome: item.outcome_status || 'progressed',
        phaseName: item.project_id === projectId ? phaseById.get(item.phase_id) || null : null,
      })),
      moods: (moods || []).map((item) => ({ date: item.mood_date, label: getMoodByKey(item.mood_key)?.label || item.mood_key })),
      spaceHistory: historyText,
    });

    const projectSessions = weeklySessions.filter((item) => item.project_id === projectId);
    const totalMinutes = projectSessions.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0);
    const completionRate = projectSessions.length
      ? Math.round((projectSessions.filter((item) => item.outcome_status === 'completed').length / projectSessions.length) * 100)
      : 0;
    const { data: savedReview, error: saveError } = await supabase
      .from('reviews')
      .insert({
        project_id: projectId,
        review_type: 'weekly',
        period_start: periodStart,
        period_end: periodEnd,
        summary: review.summary,
        insights: review.insights,
        next_steps: review.nextSteps,
        total_minutes: totalMinutes,
        completion_rate: completionRate,
      })
      .select('*')
      .single();
    if (saveError) throw saveError;

    return Response.json(savedReview);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成 AI 周复盘失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
