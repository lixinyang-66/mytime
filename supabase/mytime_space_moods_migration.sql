-- MyTime 空间表情状态迁移
-- 在 Supabase Dashboard > SQL Editor 执行一次。

CREATE TABLE IF NOT EXISTS public.space_moods (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  mood_date DATE NOT NULL,
  mood_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, mood_date)
);

CREATE INDEX IF NOT EXISTS idx_space_moods_space_date
ON public.space_moods (space_id, mood_date DESC);

DROP TRIGGER IF EXISTS set_space_moods_updated_at ON public.space_moods;
CREATE TRIGGER set_space_moods_updated_at
BEFORE UPDATE ON public.space_moods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
