import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { generatePersonalizedReview } from '@/lib/ai';
import { getWeekEnd, getWeekStart, toDateKey } from '@/lib/date';
import { getMoodByKey } from '@/lib/moods';
import { getSupabaseAdmin } from '@/lib/supabase';

function isMissingFocusTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string };
  return details.code === '42P01' || details.code === 'PGRST205'
    || details.message?.includes('space_weekly_reviews') === true
    || details.message?.includes('space_focus_') === true;
}

export async function POST(_request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const now = new Date();
  const weekStart = toDateKey(getWeekStart(now));
  const weekEnd = toDateKey(getWeekEnd(now));
  try {
    const supabase = getSupabaseAdmin();
    const { data: projects, error: projectsError } = await supabase
      .from('projects').select('id,name,project_type,goal').eq('space_id', auth.spaceId);
    if (projectsError) throw projectsError;
    const projectIds = (projects || []).map((project) => project.id);
    const projectNames = new Map((projects || []).map((project) => [project.id, project.name]));
    const { data: focusPlan, error: focusPlanError } = await supabase
      .from('space_focus_plans')
      .select('id')
      .eq('space_id', auth.spaceId)
      .eq('week_start_date', weekStart)
      .maybeSingle();
    if (focusPlanError) throw focusPlanError;
    const { data: focusItems, error: focusItemsError } = focusPlan
      ? await supabase.from('space_focus_items').select('project_id,daily_minutes').eq('space_focus_plan_id', focusPlan.id)
      : { data: [], error: null };
    if (focusItemsError) throw focusItemsError;
    const dailyTargetMinutes = (focusItems || []).reduce((sum, item) => sum + Number(item.daily_minutes || 0), 0);
    const dailyPlanDescription = (focusItems || []).map((item) => `${projectNames.get(item.project_id) || '项目'} ${Number(item.daily_minutes || 0)} 分钟/天`).join('；');
    const { data: sessions, error: sessionsError } = projectIds.length
      ? await supabase.from('study_sessions').select('project_id,phase_id,study_date,duration_minutes,content,outcome_status').in('project_id', projectIds).gte('study_date', weekStart).lte('study_date', weekEnd).order('study_date')
      : { data: [], error: null };
    if (sessionsError) throw sessionsError;
    const { data: moods, error: moodsError } = await supabase
      .from('space_moods').select('mood_date,mood_key').eq('space_id', auth.spaceId).gte('mood_date', weekStart).lte('mood_date', weekEnd).order('mood_date');
    if (moodsError) throw moodsError;

    const review = await generatePersonalizedReview({
      projectName: '本周全部项目',
      projectGoal: '根据本周真实完成记录，回看整体投入、阻碍和下一步。',
      projectType: 'general',
      reviewScope: 'weekly',
      periodStart: weekStart,
      periodEnd: weekEnd,
      dailyTargetMinutes,
      dailyPlanDescription,
      sessions: (sessions || []).map((session) => ({
        studyDate: session.study_date,
        durationMinutes: Number(session.duration_minutes || 0),
        content: `${projectNames.get(session.project_id) || '项目'}：${session.content || '未填写内容'}`,
        outcome: session.outcome_status || 'progressed',
      })),
      moods: (moods || []).map((mood) => ({ date: mood.mood_date, label: getMoodByKey(mood.mood_key)?.label || mood.mood_key })),
      spaceHistory: `本周共有 ${(projects || []).length} 个项目。`,
    });
    const totalMinutes = (sessions || []).reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0);
    const { data: saved, error: saveError } = await supabase
      .from('space_weekly_reviews')
      .upsert({
        space_id: auth.spaceId,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        summary: review.summary,
        insights: review.insights,
        next_steps: review.nextSteps || null,
        total_minutes: totalMinutes,
        session_count: (sessions || []).length,
      }, { onConflict: 'space_id,week_start_date' })
      .select('*')
      .single();
    if (saveError) throw saveError;
    return Response.json(saved);
  } catch (error) {
    if (isMissingFocusTable(error)) return Response.json({ error: '需要先执行 V2.3 空间专注数据库迁移。', migrationRequired: true }, { status: 409 });
    const message = error instanceof Error ? error.message : '生成本周 AI 复盘失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
