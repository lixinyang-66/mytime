import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ReviewType } from '@/types';

// GET: 获取指定项目的复盘列表
export async function GET(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0);
  const reviewType = request.nextUrl.searchParams.get('type') as ReviewType | null;

  if (!projectId) {
    return Response.json({ error: '缺少项目 ID。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    let query = supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (reviewType) {
      query = query.eq('review_type', reviewType);
    }

    const { data: reviews, error } = await query;
    if (error) throw error;

    const latestReviews = (reviews || []).filter((review, index, list) =>
      list.findIndex((candidate) => candidate.review_type === review.review_type && candidate.period_start === review.period_start) === index,
    );
    return Response.json(latestReviews);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取复盘数据失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: 创建复盘记录（可由 AI 生成或用户手动填写）
export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0);
  const reviewType = String(body.review_type || '') as ReviewType;
  const periodStart = String(body.period_start || '');
  const periodEnd = String(body.period_end || '');
  const summary = String(body.summary || '').trim();

  if (!projectId || !reviewType || !periodStart || !periodEnd || !summary) {
    return Response.json({ error: '请填写完整信息。' }, { status: 400 });
  }
  if (!['daily', 'weekly', 'monthly'].includes(reviewType)) {
    return Response.json({ error: '复盘类型不正确。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 验证项目归属
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('space_id', auth.spaceId)
      .single();
    if (projectError || !project) {
      return Response.json({ error: '项目不存在或无权限访问。' }, { status: 404 });
    }

    const reviewPayload = {
      project_id: projectId,
      review_type: reviewType,
      period_start: periodStart,
      period_end: periodEnd,
      summary,
      insights: body.insights || null,
      next_steps: body.next_steps || null,
      total_minutes: Number(body.total_minutes || 0),
      completion_rate: Number(body.completion_rate || 0),
    };
    const { data: existingReview, error: existingReviewError } = await supabase
      .from('reviews')
      .select('id')
      .eq('project_id', projectId)
      .eq('review_type', reviewType)
      .eq('period_start', periodStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingReviewError) throw existingReviewError;

    const { data: review, error } = existingReview
      ? await supabase.from('reviews').update(reviewPayload).eq('id', existingReview.id).select('*').single()
      : await supabase.from('reviews').insert(reviewPayload).select('*').single();
    if (error) throw error;

    return Response.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存复盘失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
