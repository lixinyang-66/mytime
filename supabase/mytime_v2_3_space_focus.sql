-- ============================================================
-- MyTime V2.3 Migration: 空间级每周专注
-- 在 Supabase Dashboard > SQL Editor 中执行一次。
-- 不会删除既有项目、项目周计划或专注记录。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.space_focus_plans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  daily_start_time TEXT NOT NULL DEFAULT '09:00',
  daily_end_time TEXT NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT space_focus_plans_week_range CHECK (week_end_date = week_start_date + 6),
  CONSTRAINT space_focus_plans_time_range CHECK (daily_start_time < daily_end_time),
  CONSTRAINT space_focus_plans_space_week_unique UNIQUE (space_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS public.space_focus_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_focus_plan_id BIGINT NOT NULL REFERENCES public.space_focus_plans(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  daily_minutes INTEGER NOT NULL CHECK (daily_minutes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT space_focus_items_plan_project_unique UNIQUE (space_focus_plan_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.space_weekly_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  summary TEXT NOT NULL,
  insights TEXT,
  next_steps TEXT,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT space_weekly_reviews_week_range CHECK (week_end_date = week_start_date + 6),
  CONSTRAINT space_weekly_reviews_space_week_unique UNIQUE (space_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_space_focus_plans_space_week
  ON public.space_focus_plans (space_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_space_focus_items_plan
  ON public.space_focus_items (space_focus_plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_space_weekly_reviews_space_week
  ON public.space_weekly_reviews (space_id, week_start_date DESC);

DROP TRIGGER IF EXISTS set_space_focus_plans_updated_at ON public.space_focus_plans;
CREATE TRIGGER set_space_focus_plans_updated_at
BEFORE UPDATE ON public.space_focus_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_space_focus_items_updated_at ON public.space_focus_items;
CREATE TRIGGER set_space_focus_items_updated_at
BEFORE UPDATE ON public.space_focus_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
