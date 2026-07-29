-- ============================================================
-- MyTime V2.1 Migration: 项目类型、专注结果与个性化 AI 复盘
-- 在 Supabase Dashboard > SQL Editor 中执行一次。
-- 该迁移不会删除既有项目、周计划或专注记录。
-- ============================================================

-- 1. 项目所属的业务场景：用于检索对应的方法卡，而非给用户贴标签。
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'general'
    CHECK (project_type IN ('research', 'fitness', 'competition', 'exam', 'general')),
  ADD COLUMN IF NOT EXISTS project_subtype TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_space_type
  ON public.projects (space_id, project_type);

-- 2. 专注记录关联当前项目阶段，并保存真实结果。
-- task_board_id 改为可空：用户不必先建立板块才能开始一次专注。
ALTER TABLE public.study_sessions
  ALTER COLUMN task_board_id DROP NOT NULL;

ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS phase_id BIGINT REFERENCES public.project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_status TEXT NOT NULL DEFAULT 'progressed'
    CHECK (outcome_status IN ('progressed', 'completed', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_study_sessions_project_phase_date
  ON public.study_sessions (project_id, phase_id, study_date DESC);

-- 3. 周推进使用“预计投入”而不是强制的“每天固定分钟数”。
-- 保留 daily_minutes，兼容既有周计划与历史统计。
ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS expected_minutes INTEGER
    CHECK (expected_minutes IS NULL OR expected_minutes >= 0);

UPDATE public.weekly_plan_items
SET expected_minutes = daily_minutes * 7
WHERE expected_minutes IS NULL AND daily_minutes > 0;

-- 4. 面向后续管理员维护的知识卡基础表。
-- 本轮应用内置首批方法卡；后续可在此表中维护有授权来源的内容。
CREATE TABLE IF NOT EXISTS public.knowledge_cards (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  card_type TEXT NOT NULL CHECK (card_type IN ('domain', 'project_management', 'behavior')),
  project_type TEXT NOT NULL DEFAULT 'general'
    CHECK (project_type IN ('research', 'fitness', 'competition', 'exam', 'general')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_cards_type
  ON public.knowledge_cards (project_type, card_type, is_active);

DROP TRIGGER IF EXISTS set_knowledge_cards_updated_at ON public.knowledge_cards;
CREATE TRIGGER set_knowledge_cards_updated_at
BEFORE UPDATE ON public.knowledge_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
