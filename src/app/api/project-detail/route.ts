import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { generateAIPlanWithDiagnostics } from '@/lib/ai';
import { buildStats } from '@/lib/stats';
import type { Difficulty } from '@/types';

// GET: 获取指定项目的详细数据（阶段、板块、周计划、记录、复盘）
export async function GET(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0);
  if (!projectId) {
    return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    // 获取阶段
    const { data: phases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    // 获取任务板块
    const { data: taskBoards } = await supabase
      .from('task_boards')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_custom', true)
      .order('sort_order', { ascending: true });

    // 获取当前周计划
    const today = new Date().toISOString().slice(0, 10);
    const { data: currentPlan } = await supabase
      .from('weekly_plans')
      .select('*, weekly_plan_items(*, task_board:task_boards(*))')
      .eq('project_id', projectId)
      .lte('week_start_date', today)
      .gte('week_end_date', today)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 统计需要完整的记录集合，不能只使用「最近 30 条」。
    const { data: allSessions } = await supabase
      .from('study_sessions')
      .select('*, task_board:task_boards(*)')
      .eq('project_id', projectId)
      .order('study_date', { ascending: false })
      .limit(500);

    // 获取最近记录
    const { data: recentSessions } = await supabase
      .from('study_sessions')
      .select('*, task_board:task_boards(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(30);

    // 获取最近复盘
    const { data: recentReviews } = await supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('period_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const currentPlanItems = currentPlan?.weekly_plan_items
      ? currentPlan.weekly_plan_items.filter((item: { task_board?: { is_custom?: boolean } }) => item.task_board?.is_custom)
      : [];
    // 专注记录不再强制绑定行动项；保留未绑定的记录，才能用于项目复盘。
    const customSessions = (allSessions || []).filter((item: { task_board_id?: number | null; task_board?: { is_custom?: boolean } }) => !item.task_board_id || item.task_board?.is_custom);
    const customRecentSessions = (recentSessions || []).filter((item: { task_board_id?: number | null; task_board?: { is_custom?: boolean } }) => !item.task_board_id || item.task_board?.is_custom);
    const planWithoutItems = currentPlan ? { ...currentPlan, weekly_plan_items: undefined } : null;

    return Response.json({
      project,
      phases: phases || [],
      taskBoards: taskBoards || [],
      currentPlan: planWithoutItems,
      currentPlanItems,
      recentSessions: customRecentSessions,
      recentReviews: (recentReviews || []).filter((review, index, reviews) =>
        reviews.findIndex((candidate) => candidate.review_type === review.review_type && candidate.period_start === review.period_start) === index,
      ),
      stats: buildStats(customSessions, currentPlanItems, {
        trendStartDate: project.start_date,
        trendEndDate: project.end_date,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取项目数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: AI 重新生成项目计划
export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);

  if (!projectId) {
    return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 获取项目信息
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    // 删除旧阶段
    await supabase.from('project_phases').delete().eq('project_id', projectId);

    // AI 生成新阶段
    const generatedPlan = await generateAIPlanWithDiagnostics({
      name: project.name,
      goal: project.goal || project.total_goal,
      startDate: project.start_date,
      endDate: project.end_date,
      dailyStart: project.daily_start_time || '19:30',
      dailyEnd: project.daily_end_time || '23:30',
      difficulty: project.difficulty as Difficulty,
      projectType: project.project_type || 'general',
      projectSubtype: project.project_subtype,
    });
    const phases = generatedPlan.phases;

    if (phases.length > 0) {
      const { error: phaseError } = await supabase.from('project_phases').insert(
        phases.map((p) => ({
          project_id: projectId,
          name: p.name,
          start_date: p.start_date,
          end_date: p.end_date,
          sort_order: p.sort_order,
          status: 'pending',
          progress: 0,
        })),
      );
      if (phaseError) throw phaseError;
    }

    // 更新项目计划来源
    await supabase
      .from('projects')
      .update({ plan_source: generatedPlan.planSource })
      .eq('id', projectId);

    // 返回新生成的阶段
    const { data: newPhases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    return Response.json({ phases: newPhases || [], planSource: generatedPlan.planSource, failureReason: generatedPlan.failureReason });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 生成计划失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
