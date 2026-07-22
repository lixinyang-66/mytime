import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

type PlanItemPayload = {
  task_board_id: number;
  daily_minutes: number;
};

function getMinutesBetween(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = (startHour || 0) * 60 + (startMinute || 0);
  const end = (endHour || 0) * 60 + (endMinute || 0);
  return Math.max(0, end - start);
}

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id || 0);

  if (!projectId) {
    return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? (body.items as PlanItemPayload[]) : [];
  const selectedItems = items
    .map((item) => ({ task_board_id: Number(item.task_board_id), daily_minutes: Number(item.daily_minutes || 0) }))
    .filter((item) => item.task_board_id > 0 && item.daily_minutes > 0);

  if (!body.week_start_date || !body.week_end_date) {
    return Response.json({ error: '缺少周计划日期。' }, { status: 400 });
  }
  if (selectedItems.length < 1) {
    return Response.json({ error: '每周计划至少选择 1 个任务板块。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属当前空间
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('daily_start_time,daily_end_time')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();

    if (projectError) throw projectError;

    const targetMinutes = getMinutesBetween(project.daily_start_time, project.daily_end_time);
    const selectedTotalMinutes = selectedItems.reduce((acc, item) => acc + item.daily_minutes, 0);
    if (selectedTotalMinutes !== targetMinutes) {
      return Response.json({ error: `所有板块每天时间之和必须等于项目每日固定时间 ${targetMinutes} 分钟。` }, { status: 400 });
    }

    const { data: projectBoards, error: boardsError } = await supabase
      .from('task_boards')
      .select('id')
      .eq('project_id', projectId)
      .eq('is_custom', true);
    if (boardsError) throw boardsError;

    const validBoardIds = new Set((projectBoards || []).map((board) => Number(board.id)));
    if (selectedItems.some((item) => !validBoardIds.has(item.task_board_id))) {
      return Response.json({ error: '选择的任务板块不存在或不属于当前项目。' }, { status: 400 });
    }

    const { data: plan, error: planError } = await supabase
      .from('weekly_plans')
      .upsert(
        {
          project_id: projectId,
          week_start_date: String(body.week_start_date),
          week_end_date: String(body.week_end_date),
          theme: String(body.theme || '时间感知周'),
        },
        { onConflict: 'project_id,week_start_date' },
      )
      .select('*')
      .single();

    if (planError) throw planError;

    const { error: deleteError } = await supabase.from('weekly_plan_items').delete().eq('weekly_plan_id', plan.id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from('weekly_plan_items').insert(
      selectedItems.map((item) => ({
        weekly_plan_id: plan.id,
        task_board_id: item.task_board_id,
        daily_minutes: item.daily_minutes,
      })),
    );
    if (insertError) throw insertError;

    return Response.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存周计划失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
