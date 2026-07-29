-- ============================================================
-- MyTime V2.2 Migration: 项目初始状态说明
-- 在 Supabase Dashboard > SQL Editor 中执行一次。
-- 不会修改已有项目的数据。
-- ============================================================

-- 用户填写的项目初始状态原文，例如“已完成选题，等待开始写作”。
-- projects.status 仍保留机器可读的 active / paused / completed 状态，
-- 由应用根据该说明进行归一化，供甘特图标签和筛选使用。
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS initial_status_note TEXT;
