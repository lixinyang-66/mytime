import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { isMoodKey } from '@/lib/moods';
import { getSupabaseAdmin } from '@/lib/supabase';

function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function isMissingMoodTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string };
  return details.code === '42P01' || details.code === 'PGRST205' || details.message?.includes('space_moods') === true;
}

export async function GET() {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('space_moods')
      .select('id,space_id,mood_date,mood_key,created_at,updated_at')
      .eq('space_id', auth.spaceId)
      .order('mood_date', { ascending: false });
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    if (isMissingMoodTable(error)) {
      return Response.json({ error: '表情状态功能尚未初始化，请先执行 space moods 迁移脚本。' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : '读取状态记录失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const moodKey = String(body.moodKey || '');
  const moodDate = String(body.moodDate || '');

  if (!isMoodKey(moodKey)) {
    return Response.json({ error: '请选择有效的表情状态。' }, { status: 400 });
  }
  if (!isValidDateKey(moodDate)) {
    return Response.json({ error: '状态日期不正确。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('space_moods')
      .upsert(
        { space_id: auth.spaceId, mood_date: moodDate, mood_key: moodKey },
        { onConflict: 'space_id,mood_date' },
      )
      .select('id,space_id,mood_date,mood_key,created_at,updated_at')
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    if (isMissingMoodTable(error)) {
      return Response.json({ error: '表情状态功能尚未初始化，请先执行 space moods 迁移脚本。' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : '保存状态失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
