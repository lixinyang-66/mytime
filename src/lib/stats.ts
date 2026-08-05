import type { StudySession, WeeklyPlanItem, Stats } from '@/types';
import { diffDays, getWeekEnd, getWeekStart, toDateKey } from './date';

type StatsOptions = {
  now?: Date;
  trendStartDate?: string;
  trendEndDate?: string;
};

export function buildStats(sessions: StudySession[], currentPlanItems: WeeklyPlanItem[], options: StatsOptions = {}): Stats {
  const now = options.now ?? new Date();
  const today = toDateKey(now);
  const weekStart = toDateKey(getWeekStart(now));
  const weekEnd = toDateKey(getWeekEnd(now));
  const monthKey = today.slice(0, 7);

  const todayMinutes = sum(sessions.filter((item) => item.study_date === today));
  const weekSessions = sessions.filter((item) => item.study_date >= weekStart && item.study_date <= weekEnd);
  const weekMinutes = sum(weekSessions);
  const monthMinutes = sum(sessions.filter((item) => item.study_date.startsWith(monthKey)));
  const totalMinutes = sum(sessions);
  const totalDays = new Set(sessions.map((item) => item.study_date)).size;
  // V2.1 的周推进以「本周预计投入」为单位，兼容旧版按日填写的计划。
  const weekTargetMinutes = currentPlanItems.reduce(
    (acc, item) => acc + Number(item.expected_minutes ?? (Number(item.daily_minutes || 0) * 7)),
    0,
  );

  const byBoardThisWeek: Record<number, number> = {};
  for (const item of currentPlanItems) byBoardThisWeek[item.task_board_id] = 0;
  for (const session of weekSessions) {
    if (session.task_board_id) {
      byBoardThisWeek[session.task_board_id] = (byBoardThisWeek[session.task_board_id] || 0) + session.duration_minutes;
    }
  }

  return {
    todayMinutes,
    weekMinutes,
    monthMinutes,
    totalMinutes,
    totalDays,
    weekTargetMinutes,
    completionRate: weekTargetMinutes ? Math.min(100, Math.round((weekMinutes / weekTargetMinutes) * 100)) : 0,
    streakDays: calculateStreak(sessions, today),
    byBoardThisWeek,
    weeklyTrend: buildProjectWeeklyTrend(sessions, options.trendStartDate, options.trendEndDate, now),
  };
}

function buildProjectWeeklyTrend(sessions: StudySession[], trendStartDate: string | undefined, trendEndDate: string | undefined, now: Date): Array<{ weekStart: string; label: string; minutes: number; days: number }> {
  const fallbackStart = sessions.length
    ? sessions.map((item) => item.study_date).sort()[0]
    : undefined;
  const startKey = trendStartDate || fallbackStart;
  if (!startKey) return [];

  const start = new Date(`${startKey}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const configuredEnd = trendEndDate ? new Date(`${trendEndDate}T00:00:00`) : today;
  const end = configuredEnd < today ? configuredEnd : today;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const weekCount = Math.floor((end.getTime() - start.getTime()) / (7 * 86400000)) + 1;
  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + (index * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartKey = toDateKey(weekStart);
    const weekEndKey = toDateKey(weekEnd < end ? weekEnd : end);
    const items = sessions.filter((item) => item.study_date >= weekStartKey && item.study_date <= weekEndKey);
    return {
      weekStart: weekStartKey,
      label: `第${index + 1}周`,
      minutes: sum(items),
      days: new Set(items.map((item) => item.study_date)).size,
    };
  });
}

function sum(items: StudySession[]): number {
  return items.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0);
}

function calculateStreak(sessions: StudySession[], today: string): number {
  const days = Array.from(new Set(sessions.map((item) => item.study_date))).sort().reverse();
  if (days.length === 0) return 0;

  let cursor = today;
  let streak = 0;

  for (const day of days) {
    const gap = diffDays(cursor, day);
    if (gap === 0 || (streak === 0 && gap === 1)) {
      streak += 1;
      const date = new Date(`${day}T00:00:00`);
      date.setDate(date.getDate() - 1);
      cursor = date.toISOString().slice(0, 10);
      continue;
    }
    break;
  }

  return streak;
}
