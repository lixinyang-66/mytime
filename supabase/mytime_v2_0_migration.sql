-- ============================================================
-- MyTime V2.0 Migration: Space + AI Plan + Gantt + Reviews
-- ============================================================
-- 执行前请备份数据！
-- 执行顺序：在 Supabase SQL Editor 中粘贴全部内容并运行
-- ============================================================

-- 1. 创建 spaces 表（个人时间管理空间）
CREATE TABLE IF NOT EXISTS public.spaces (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. projects 表新增字段
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES public.spaces(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard'));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS plan_source TEXT DEFAULT 'manual' CHECK (plan_source IN ('ai','manual','modified'));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS daily_start_time TEXT DEFAULT '19:30';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS daily_end_time TEXT DEFAULT '23:30';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','paused'));

-- 3. 创建 project_phases 表（项目阶段 / 甘特图条目）
CREATE TABLE IF NOT EXISTS public.project_phases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 创建 reviews 表（AI 复盘总结）
CREATE TABLE IF NOT EXISTS public.reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('daily','weekly','monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT NOT NULL,
  insights TEXT,
  next_steps TEXT,
  total_minutes INT DEFAULT 0,
  completion_rate INT DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_spaces_password ON public.spaces(password_hash);
CREATE INDEX IF NOT EXISTS idx_projects_space ON public.projects(space_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project ON public.project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_dates ON public.project_phases(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON public.reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_period ON public.reviews(period_start, period_end);

-- 6. 迁移现有数据：把旧 projects 迁移到新的 spaces + projects 结构
DO $$
DECLARE
  v_space_id BIGINT;
  v_old_project RECORD;
  v_new_project_id BIGINT;
BEGIN
  -- 检查是否有旧数据需要迁移
  IF EXISTS (SELECT 1 FROM public.projects LIMIT 1) THEN

    -- 创建默认空间
    INSERT INTO public.spaces (name, password_hash)
    VALUES ('我的时间空间', 'migrated_needs_password')
    RETURNING id INTO v_space_id;

    -- 迁移每个旧项目
    FOR v_old_project IN SELECT * FROM public.projects LOOP
      INSERT INTO public.projects (
        space_id, name, slug, password_hash,
        start_date, end_date, total_goal, goal, difficulty, plan_source,
        daily_start_time, daily_end_time, status
      )
      VALUES (
        v_space_id,
        v_old_project.name,
        v_old_project.slug,
        'migrated_needs_password',
        v_old_project.start_date,
        v_old_project.end_date,
        v_old_project.total_goal,
        v_old_project.total_goal,
        'medium',
        'manual',
        COALESCE(v_old_project.study_start_time, '19:30'),
        COALESCE(v_old_project.study_end_time, '23:30'),
        'active'
      )
      RETURNING id INTO v_new_project_id;

      -- 迁移该项目的周计划到新项目
      UPDATE public.weekly_plans
      SET project_id = v_new_project_id
      WHERE project_id = v_old_project.id;

      -- 迁移该项目的学习记录到新项目
      UPDATE public.study_sessions
      SET project_id = v_new_project_id
      WHERE project_id = v_old_project.id;
    END LOOP;

    -- 删除旧项目（数据已迁移到新记录）
    DELETE FROM public.projects WHERE space_id IS NULL;

  END IF;
END $$;
