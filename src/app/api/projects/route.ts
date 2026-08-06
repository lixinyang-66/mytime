import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { classifyProjectWithLLM, generateAIPlanWithDiagnostics } from '@/lib/ai';
import type { Difficulty, ProjectType } from '@/types';

type PhaseOverride = { name: string; start_date: string; end_date: string };
const projectTypes: ProjectType[] = ['research', 'fitness', 'competition', 'exam', 'general'];
const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

function normalizePhaseOverrides(value: unknown): PhaseOverride[] | null {
  if (!Array.isArray(value)) return null;
  const phases = value.map((item) => {
    const phase = item as Record<string, unknown>;
    return {
      name: String(phase.name || '').trim(),
      start_date: String(phase.start_date || ''),
      end_date: String(phase.end_date || ''),
    };
  });
  if (!phases.length || phases.some((phase) => !phase.name || !phase.start_date || !phase.end_date || phase.start_date > phase.end_date)) return null;
  return phases;
}

export async function GET() {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,slug,start_date,end_date,total_goal,goal,difficulty,project_type,project_subtype,plan_source,daily_start_time,daily_end_time,status,initial_status_note')
      .eq('space_id', auth.spaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const startDate = String(body.start_date || '');
  const endDate = String(body.end_date || '');
  const goal = String(body.goal || '').trim();
  const dailyStartTime = String(body.daily_start_time || '19:30');
  const dailyEndTime = String(body.daily_end_time || '23:30');
  const initialStatusNote = String(body.initial_status_note || '').trim().slice(0, 240);
  const isPreview = Boolean(body.preview);

  if (!name || !startDate || !endDate || !goal) {
    return Response.json({ error: '请填写项目名称、目标、开始和截止日期。' }, { status: 400 });
  }
  if (startDate > endDate) {
    return Response.json({ error: '截止日期不能早于开始日期。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const suppliedType = String(body.auto_project_type || '');
    const suppliedSubtype = String(body.auto_project_subtype || '').trim() || null;
    const suppliedDifficulty = String(body.auto_difficulty || '');
    const classification = projectTypes.includes(suppliedType as ProjectType)
      ? {
        projectType: suppliedType as ProjectType,
        projectSubtype: suppliedSubtype,
        difficulty: difficulties.includes(suppliedDifficulty as Difficulty) ? suppliedDifficulty as Difficulty : 'medium',
      }
      : await classifyProjectWithLLM({ name, goal });

    const hasOverrides = Object.prototype.hasOwnProperty.call(body, 'phase_overrides');
    const phaseOverrides = hasOverrides ? normalizePhaseOverrides(body.phase_overrides) : null;
    if (hasOverrides && !phaseOverrides) {
      return Response.json({ error: '请至少保留一个名称和日期完整的项目阶段。' }, { status: 400 });
    }

    const generatedPlan = phaseOverrides ? null : await generateAIPlanWithDiagnostics({
      name,
      goal,
      startDate,
      endDate,
      dailyStart: dailyStartTime,
      dailyEnd: dailyEndTime,
      difficulty: classification.difficulty,
      projectType: classification.projectType,
      projectSubtype: classification.projectSubtype,
      initialStatusNote,
    });
    const phases = phaseOverrides || generatedPlan?.phases || [];
    const planSource = phaseOverrides ? 'modified' : generatedPlan?.planSource || 'fallback';

    if (isPreview) {
      return Response.json({
        classification,
        phases,
        planSource,
        failureReason: generatedPlan?.failureReason,
      });
    }

    const slug = `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'project'}-${Date.now()}`;
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
        difficulty: classification.difficulty,
        project_type: classification.projectType,
        project_subtype: classification.projectSubtype,
        plan_source: planSource,
        daily_start_time: dailyStartTime,
        daily_end_time: dailyEndTime,
        // 总项目状态不是由初始描述猜测；空间页会按“本周是否推进 + 是否完成全部阶段”实时计算。
        status: 'active',
        initial_status_note: initialStatusNote || null,
      })
      .select('*')
      .single();
    if (projectError) throw projectError;

    if (phases.length > 0) {
      const { error: phaseError } = await supabase.from('project_phases').insert(
        phases.map((phase, index) => ({
          project_id: project.id,
          name: phase.name,
          start_date: phase.start_date,
          end_date: phase.end_date,
          sort_order: index + 1,
          status: 'pending',
          progress: 0,
        })),
      );
      if (phaseError) throw phaseError;
    }

    const { data: createdPhases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true });
    return Response.json({ ...project, phases: createdPhases || [], planSource, failureReason: generatedPlan?.failureReason });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

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
    if (!project) return Response.json({ error: '项目不存在或不属于当前空间。' }, { status: 404 });

    const { error: deleteError } = await supabase.from('projects').delete().eq('id', projectId);
    if (deleteError) throw deleteError;
    return Response.json({ ok: true, deletedProject: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除项目失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
