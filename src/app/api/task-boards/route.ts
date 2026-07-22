import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { TaskKind } from '@/types';

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id || 0);
  const name = String(body.name || '').trim();
  const kind = String(body.kind || 'temporary') as TaskKind;
  const goal = String(body.goal || '').trim();

  if (!projectId) return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  if (!name) return Response.json({ error: '请填写任务板块名称。' }, { status: 400 });
  if (!['temporary', 'long_term'].includes(kind)) return Response.json({ error: '任务类型不正确。' }, { status: 400 });
  if (kind === 'long_term' && !goal) return Response.json({ error: '长期任务必须设定目标。' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属当前空间
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限。' }, { status: 400 });
    }

    const { count } = await supabase
      .from('task_boards')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const { data, error } = await supabase
      .from('task_boards')
      .insert({
        project_id: projectId,
        name,
        kind,
        goal: goal || null,
        is_custom: true,
        sort_order: (count || 0) + 1,
      })
      .select('*')
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建任务板块失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id || 0);
  const kind = String(body.kind || 'temporary') as TaskKind;
  const goal = String(body.goal || '').trim();

  if (!id) return Response.json({ error: '缺少任务板块 ID。' }, { status: 400 });
  if (!['temporary', 'long_term'].includes(kind)) return Response.json({ error: '任务类型不正确。' }, { status: 400 });
  if (kind === 'long_term' && !goal) return Response.json({ error: '长期任务必须设定目标。' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('task_boards')
      .update({ kind, goal: goal || null })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新任务板块失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id || 0);

  if (!id) return Response.json({ error: '缺少任务板块 ID。' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();

    const { error: sessionDeleteError } = await supabase
      .from('study_sessions')
      .delete()
      .eq('task_board_id', id);
    if (sessionDeleteError) throw sessionDeleteError;

    const { error: planItemDeleteError } = await supabase
      .from('weekly_plan_items')
      .delete()
      .eq('task_board_id', id);
    if (planItemDeleteError) throw planItemDeleteError;

    const { error } = await supabase
      .from('task_boards')
      .delete()
      .eq('id', id)
      .eq('is_custom', true);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除任务板块失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
