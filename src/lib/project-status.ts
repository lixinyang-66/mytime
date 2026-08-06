import type { PhaseStatus, ProjectStatus } from '@/types';

type PhaseLike = { status: PhaseStatus | string };

/**
 * 项目是否真正完成只看阶段完成情况；不从创建时的文字或日期推断。
 */
export function isProjectCompleted(phases: PhaseLike[]): boolean {
  return phases.length > 0 && phases.every((phase) => phase.status === 'completed');
}

/**
 * 空间项目标签由本周计划决定：完成优先，其次才是本周是否推进。
 */
export function deriveProjectStatus(phases: PhaseLike[], isInCurrentWeekPlan: boolean): ProjectStatus {
  if (isProjectCompleted(phases)) return 'completed';
  return isInCurrentWeekPlan ? 'active' : 'paused';
}
