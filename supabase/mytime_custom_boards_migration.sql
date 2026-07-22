-- MyTime 自定义板块迁移脚本
-- 目的：移除旧版本自动生成的系统预设板块，仅保留用户自定义板块。
-- 使用方式：复制本文件全部内容到 Supabase Dashboard > SQL Editor 执行。
-- 注意：该脚本会删除 is_custom = false 的任务板块，以及这些板块关联的周计划条目和时间记录。

-- 1. 删除系统预设板块关联的时间记录
DELETE FROM public.study_sessions
WHERE task_board_id IN (
  SELECT id FROM public.task_boards WHERE is_custom = false
);

-- 2. 删除系统预设板块关联的周计划条目
DELETE FROM public.weekly_plan_items
WHERE task_board_id IN (
  SELECT id FROM public.task_boards WHERE is_custom = false
);

-- 3. 删除系统预设板块
DELETE FROM public.task_boards
WHERE is_custom = false;
