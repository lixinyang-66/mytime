export type TaskKind = 'temporary' | 'long_term';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PlanSource = 'ai' | 'manual' | 'modified';
export type PhaseStatus = 'pending' | 'in_progress' | 'completed';
export type ProjectStatus = 'active' | 'completed' | 'paused';
export type ReviewType = 'daily' | 'weekly' | 'monthly';
export type ProjectType = 'research' | 'fitness' | 'competition' | 'exam' | 'general';
export type SessionOutcome = 'progressed' | 'completed' | 'blocked';

// === V2.0: Space ===
export type Space = {
  id: number;
  name: string;
  created_at?: string;
};

export type SpaceMood = {
  id: number;
  space_id: number;
  mood_date: string;
  mood_key: string;
  created_at?: string;
  updated_at?: string;
};

// === V2.0: Project (enhanced) ===
export type Project = {
  id: number;
  space_id: number;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  total_goal: string;
  goal: string | null;
  difficulty: Difficulty;
  project_type: ProjectType;
  project_subtype: string | null;
  plan_source: PlanSource;
  daily_start_time: string;
  daily_end_time: string;
  status: ProjectStatus;
  initial_status_note?: string | null;
  // Legacy fields (kept for backward compat during migration)
  password_hash?: string;
  study_start_time?: string;
  study_end_time?: string;
  created_at?: string;
  updated_at?: string;
};

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'slug' | 'start_date' | 'end_date' | 'status' | 'difficulty' | 'project_type' | 'project_subtype' | 'initial_status_note'>;

// === V2.0: Project Phases (Gantt chart) ===
export type ProjectPhase = {
  id: number;
  project_id: number;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  status: PhaseStatus;
  progress: number;
  created_at?: string;
};

// === V2.0: Reviews ===
export type Review = {
  id: number;
  project_id: number;
  review_type: ReviewType;
  period_start: string;
  period_end: string;
  summary: string;
  insights: string | null;
  next_steps: string | null;
  total_minutes: number;
  completion_rate: number;
  created_at?: string;
};

// === Existing types (updated for V2.0) ===
export type TaskBoard = {
  id: number;
  project_id: number;
  name: string;
  kind: TaskKind;
  goal: string | null;
  is_custom: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type WeeklyPlan = {
  id: number;
  project_id: number;
  week_start_date: string;
  week_end_date: string;
  theme: string;
  created_at?: string;
  updated_at?: string;
};

export type WeeklyPlanItem = {
  id: number;
  weekly_plan_id: number;
  task_board_id: number;
  daily_minutes: number;
  expected_minutes?: number | null;
  task_board?: TaskBoard;
  created_at?: string;
  updated_at?: string;
};

export type StudySession = {
  id: number;
  project_id: number;
  task_board_id: number | null;
  phase_id: number | null;
  outcome_status: SessionOutcome;
  study_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  content: string;
  created_at?: string;
  task_board?: TaskBoard;
};

export type Stats = {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
  totalDays: number;
  weekTargetMinutes: number;
  completionRate: number;
  streakDays: number;
  byBoardThisWeek: Record<number, number>;
  weeklyTrend: Array<{ weekStart: string; label: string; minutes: number; days: number }>;
};

// === V2.0: Space-level bootstrap ===
export type SpaceBootstrap = {
  space: Space;
  projects: ProjectSummary[];
  projectPhases: ProjectPhase[];
  moods: SpaceMood[];
};

// === V2.0: Project-level bootstrap ===
export type ProjectBootstrap = {
  project: Project;
  phases: ProjectPhase[];
  taskBoards: TaskBoard[];
  currentPlan: WeeklyPlan | null;
  currentPlanItems: WeeklyPlanItem[];
  recentSessions: StudySession[];
  recentReviews: Review[];
  stats: Stats;
};

// Legacy alias for backward compat
export type BootstrapData = ProjectBootstrap;

export const productBelief = {
  title: '感知时间的流逝',
  paragraphs: [
    'MyTime 不是为了制造新的打卡压力，而是帮助你重新感知时间如何从指缝里流走。',
    '当一段时间过去之后，重要的不只是它有多长，而是你在这段时间里真正做了什么。',
    '我们要警惕形式主义和假努力。时间长短不是衡量努力的唯一标准，坚持不是打卡，而是每天靠近目标。',
  ],
};
