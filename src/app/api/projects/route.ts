import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { classifyProjectWithLLM, generateAIPlanWithLLM } from '@/lib/ai';
import type { Difficulty, ProjectStatus } from '@/types';

// GET: 列出当前空间下所有项目
export async function GET() {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,slug,start_date,end_date,total_goal,goal,difficulty,project_type,project_subtype,plan_source,daily_start_time,daily_end_time,status')
      .eq('space_id', auth.spaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: 在当前空间下创建项目
export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const startDate = String(body.start_date || '');
  const endDate = String(body.end_date || '');
  const goal = String(body.goal || '').trim();
  const difficulty = (String(body.difficulty || 'medium') as Difficulty);
  const dailyStartTime = String(body.daily_start_time || '19:30');
  const dailyEndTime = String(body.daily_end_time || '23:30');
  const initialStatus = String(body.initial_status || 'active') as ProjectStatus;

  if (!name || !startDate || !endDate || !goal) {
    return Response.json({ error: '请填写项目名称、目标、开始和截止日期。' }, { status: 400 });
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return Response.json({ error: '难度选项不正确。' }, { status: 400 });
  }
  if (!['active', 'paused'].includes(initialStatus)) {
    return Response.json({ error: '项目初始状态不正确。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'project'}-${Date.now()}`;
    // 项目分类由 AI 基于名称与目标自动完成；接口不可用时有关键词降级方案。
    const classification = await classifyProjectWithLLM({ name, goal });

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        space_id: auth.spaceId,
        name,
        slug,
        start_date: startDate,
        end_date: endDate,
        total_goal: goal,
        goal,
        difficulty,
        project_type: classification.projectType,
        project_subtype: classification.projectSubtype,
        plan_source: 'ai',
        daily_start_time: dailyStartTime,
        daily_end_time: dailyEndTime,
        status: initialStatus,
      })
      .select('*')
      .single();

    if (projectError) throw projectError;

    // 项目创建后始终生成一份可修改的阶段路线图。
    {
      const phases = await generateAIPlanWithLLM({
        name,
        goal,
        startDate,
        endDate,
        dailyStart: dailyStartTime,
        dailyEnd: dailyEndTime,
        difficulty,
        projectType: classification.projectType,
        projectSubtype: classification.projectSubtype,
      });

      if (phases.length > 0) {
        const { error: phaseError } = await supabase.from('project_phases').insert(
          phases.map((p) => ({
            project_id: project.id,
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
    }

    // 查询生成的阶段一起返回
    const { data: phases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true });

    return Response.json({ ...project, phases: phases || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: 删除当前空间下的项目；数据库会级联清理项目关联的计划、记录、阶段和复盘。
export async function DELETE(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return Response.json({ error: '请选择要删除的项目。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id,name')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) {
      return Response.json({ error: '项目不存在或不属于当前空间。' }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from('projects').delete().eq('id', projectId);
    if (deleteError) throw deleteError;

    return Response.json({ ok: true, deletedProject: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
