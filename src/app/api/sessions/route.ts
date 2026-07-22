import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id || 0);
  const taskBoardId = Number(body.task_board_id || 0);
  const duration = Math.max(1, Math.round(Number(body.duration_minutes || 0)));
  const content = String(body.content || '').trim();

  if (!projectId) return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  if (!taskBoardId) return Response.json({ error: '请选择任务板块。' }, { status: 400 });
  if (!content) return Response.json({ error: '请填写这段时间你真正做了什么。' }, { status: 400 });
  if (!body.start_time || !body.end_time || !body.study_date) {
    return Response.json({ error: '缺少学习时间信息。' }, { status: 400 });
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
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限。' }, { status: 400 });
    }

    const { data: board, error: boardError } = await supabase
      .from('task_boards')
      .select('id')
      .eq('id', taskBoardId)
      .eq('project_id', projectId)
      .single();
    if (boardError || !board) return Response.json({ error: '任务板块不存在。' }, { status: 400 });

    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        project_id: projectId,
        task_board_id: taskBoardId,
        study_date: String(body.study_date),
        start_time: String(body.start_time),
        end_time: String(body.end_time),
        duration_minutes: duration,
        content,
      })
      .select('*, task_board:task_boards(*)')
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存学习记录失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
