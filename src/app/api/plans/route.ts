import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

type PlanItemPayload = {
  task_board_id: number;
  expected_minutes?: number;
};

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
    .map((item) => ({ task_board_id: Number(item.task_board_id), expected_minutes: Math.max(0, Number(item.expected_minutes || 0)) }))
    .filter((item) => item.task_board_id > 0);

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
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();

    if (projectError) throw projectError;

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
        daily_minutes: 0,
        expected_minutes: item.expected_minutes || null,
      })),
    );
    if (insertError) throw insertError;

    return Response.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存周计划失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
