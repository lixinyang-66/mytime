import { NextRequest } from 'next/server';
import { getFocusQuoteLibrarySize, getRandomFocusQuote } from '@/lib/focus-quotes';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getMoodByKey, isMoodKey } from '@/lib/moods';
import { toDateKey } from '@/lib/date';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const rawMoodKey = typeof body.moodKey === 'string' ? body.moodKey : '';
  if (rawMoodKey && !isMoodKey(rawMoodKey)) {
    return Response.json({ error: '状态无效。' }, { status: 400 });
  }

  const dateKey = toDateKey(new Date());
  let moodKey = rawMoodKey;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('space_moods')
      .select('mood_key')
      .eq('space_id', auth.spaceId)
      .eq('mood_date', dateKey)
      .maybeSingle();
    if (error) throw error;
    // The saved state is authoritative. The request body only supports the
    // immediate post-selection moment before the next bootstrap refresh.
    if (data?.mood_key && isMoodKey(data.mood_key)) moodKey = data.mood_key;
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取今日状态失败。';
    return Response.json({ error: message }, { status: 500 });
  }

  const mood = moodKey ? getMoodByKey(moodKey) : undefined;
  const quote = getRandomFocusQuote(mood?.key);
  if (!quote) return Response.json({ error: '句子库暂不可用。' }, { status: 500 });

  return Response.json({
    quote,
    source: 'library',
    mood: mood ? { key: mood.key, label: mood.label } : null,
    librarySize: getFocusQuoteLibrarySize(),
  });
}
