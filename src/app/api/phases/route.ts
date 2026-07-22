import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { PhaseStatus } from '@/types';

// GET: 获取指定项目的阶段列表（甘特图数据）
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
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    const { data: phases, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    return Response.json(phases || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取阶段数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: 批量更新项目的阶段（用户手动编辑甘特图后保存）
export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);
  const phases = Array.isArray(body.phases) ? body.phases : [];

  if (!projectId) {
    return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  }
  if (phases.length === 0) {
    return Response.json({ error: '至少需要一个阶段。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    // 删除旧阶段
    await supabase.from('project_phases').delete().eq('project_id', projectId);

    // 插入新阶段
    const { error: insertError } = await supabase.from('project_phases').insert(
      phases.map((p: Record<string, unknown>, i: number) => ({
        project_id: projectId,
        name: String(p.name || ''),
        start_date: String(p.start_date || ''),
        end_date: String(p.end_date || ''),
        sort_order: i + 1,
        status: String(p.status || 'pending'),
        progress: Number(p.progress || 0),
      })),
    );
    if (insertError) throw insertError;

    // 更新项目计划来源为手动修改
    await supabase
      .from('projects')
      .update({ plan_source: 'modified' })
      .eq('id', projectId);

    // 返回更新后的阶段
    const { data: newPhases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    return Response.json({ phases: newPhases || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存阶段数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: 更新单个阶段的状态和进度
export async function PATCH(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const phaseId = Number(body.id || 0);
  const status = String(body.status || '') as PhaseStatus;
  const progress = Number(body.progress ?? -1);

  if (!phaseId) {
    return Response.json({ error: '缺少阶段 ID。' }, { status: 400 });
  }
  if (status && !['pending', 'in_progress', 'completed'].includes(status)) {
    return Response.json({ error: '阶段状态不正确。' }, { status: 400 });
  }
  if (progress < 0 || progress > 100) {
    return Response.json({ error: '进度值应在 0 到 100 之间。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (progress >= 0) updateData.progress = progress;

    const { data, error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId)
      .select('*')
      .single();
    if (error) throw error;

    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新阶段失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
