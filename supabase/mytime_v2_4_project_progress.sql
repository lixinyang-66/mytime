-- ============================================================
-- MyTime V2.4 Migration: 基于真实记录的项目进度评估
-- 在 Supabase Dashboard > SQL Editor 中执行一次。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_progress_assessments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  progress_percent INTEGER NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
  summary TEXT,
  source TEXT NOT NULL CHECK (source IN ('deepseek', 'phase_completed', 'insufficient_data')),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  last_session_at TIMESTAMPTZ,
  phase_signature TEXT NOT NULL DEFAULT '',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_progress_assessments_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_progress_assessments_project
  ON public.project_progress_assessments (project_id);

DROP TRIGGER IF EXISTS set_project_progress_assessments_updated_at ON public.project_progress_assessments;
CREATE TRIGGER set_project_progress_assessments_updated_at
BEFORE UPDATE ON public.project_progress_assessments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
