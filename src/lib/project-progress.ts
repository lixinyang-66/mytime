import { assessProjectProgressWithDiagnostics } from '@/lib/ai';
import { isProjectCompleted } from '@/lib/project-status';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ProjectProgressAssessment, ProjectProgressSource, ProjectType } from '@/types';

type ProjectRow = { id: number; name: string; goal: string | null; total_goal: string; project_type: ProjectType; project_subtype: string | null };
type PhaseRow = { id: number; project_id: number; name: string; status: string };
type SessionRow = { project_id: number; study_date: string; duration_minutes: number; content: string; created_at: string; phase_id: number | null };
type AssessmentRow = ProjectProgressAssessment;

export function isMissingProjectProgressTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string };
  return details.code === '42P01' || details.code === 'PGRST205' || details.message?.includes('project_progress_assessments') === true;
}

function latestSessionAt(sessions: SessionRow[]): string | null {
  return sessions.reduce<string | null>((latest, session) => (!latest || session.created_at > latest ? session.created_at : latest), null);
}

function toStored(row: Record<string, unknown>): ProjectProgressAssessment {
  return row as unknown as ProjectProgressAssessment;
}

/**
 * Refreshes only assessments whose record evidence has changed. A DeepSeek failure never becomes a fake percentage.
 */
export async function refreshProjectProgressAssessments(spaceId: number, onlyProjectId?: number): Promise<ProjectProgressAssessment[]> {
  const supabase = getSupabaseAdmin();
  let projectQuery = supabase
    .from('projects')
    .select('id,name,goal,total_goal,project_type,project_subtype')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });
  if (onlyProjectId) projectQuery = projectQuery.eq('id', onlyProjectId);
  const { data: projects, error: projectError } = await projectQuery;
  if (projectError) throw projectError;
  const projectRows = (projects || []) as ProjectRow[];
  if (!projectRows.length) return [];

  const projectIds = projectRows.map((project) => project.id);
  const [phaseResult, sessionResult, assessmentResult] = await Promise.all([
    supabase.from('project_phases').select('id,project_id,name,status').in('project_id', projectIds).order('sort_order'),
    supabase.from('study_sessions').select('project_id,phase_id,study_date,duration_minutes,content,created_at').in('project_id', projectIds).order('created_at', { ascending: false }).limit(300),
    supabase.from('project_progress_assessments').select('*').in('project_id', projectIds),
  ]);
  if (phaseResult.error) throw phaseResult.error;
  if (sessionResult.error) throw sessionResult.error;
  if (assessmentResult.error) throw assessmentResult.error;

  const phasesByProject = new Map<number, PhaseRow[]>();
  for (const phase of (phaseResult.data || []) as PhaseRow[]) phasesByProject.set(phase.project_id, [...(phasesByProject.get(phase.project_id) || []), phase]);
  const sessionsByProject = new Map<number, SessionRow[]>();
  for (const session of (sessionResult.data || []) as SessionRow[]) sessionsByProject.set(session.project_id, [...(sessionsByProject.get(session.project_id) || []), session]);
  const existingByProject = new Map<number, AssessmentRow>();
  for (const assessment of (assessmentResult.data || []) as AssessmentRow[]) existingByProject.set(assessment.project_id, assessment);

  const results: ProjectProgressAssessment[] = [];
  for (const project of projectRows) {
    const phases = phasesByProject.get(project.id) || [];
    const sessions = (sessionsByProject.get(project.id) || []).slice(0, 60);
    const prior = existingByProject.get(project.id);
    const recordCount = sessions.length;
    const lastSessionAt = latestSessionAt(sessions);
    const complete = isProjectCompleted(phases);
    const phaseSignature = phases.map((phase) => `${phase.id}:${phase.status}`).join('|');
    const unchanged = prior && prior.record_count === recordCount && prior.last_session_at === lastSessionAt && prior.phase_signature === phaseSignature;
    if (unchanged && (prior.source === 'deepseek' || prior.source === 'insufficient_data' || prior.source === 'phase_completed')) {
      results.push(prior);
      continue;
    }

    let progressPercent = 0;
    let summary = '还没有可供评估的专注记录；完成第一条真实记录后再判断项目推进。';
    let source: ProjectProgressSource = 'insufficient_data';
    if (complete) {
      progressPercent = 100;
      summary = '全部项目阶段已标记为完成。';
      source = 'phase_completed';
    } else if (sessions.length) {
      const phaseNameById = new Map((phaseResult.data || []).map((phase: PhaseRow) => [phase.id, phase.name]));
      const ai = await assessProjectProgressWithDiagnostics({
        projectName: project.name,
        projectGoal: project.goal || project.total_goal,
        projectType: project.project_type || 'general',
        projectSubtype: project.project_subtype,
        phases,
        sessions: sessions.map((session) => ({
          studyDate: session.study_date,
          durationMinutes: Number(session.duration_minutes || 0),
          content: session.content,
          phaseName: session.phase_id ? phaseNameById.get(session.phase_id) || null : null,
        })),
      });
      if (!ai.assessment) {
        // Keep the last successful DeepSeek assessment rather than inventing a local estimate.
        if (prior) { results.push(prior); continue; }
        summary = `暂未获得 AI 评估（${ai.failure || 'unknown'}）；会在下次进入空间时重试。`;
      } else {
        progressPercent = ai.assessment.progressPercent;
        summary = ai.assessment.summary;
        source = 'deepseek';
      }
    }

    const { data: saved, error: saveError } = await supabase
      .from('project_progress_assessments')
      .upsert({
        project_id: project.id,
        progress_percent: progressPercent,
        summary,
        source,
        record_count: recordCount,
        last_session_at: lastSessionAt,
        phase_signature: phaseSignature,
        assessed_at: new Date().toISOString(),
      }, { onConflict: 'project_id' })
      .select('*')
      .single();
    if (saveError || !saved) throw saveError || new Error('保存项目进度评估失败');
    results.push(toStored(saved));
  }
  return results;
}
