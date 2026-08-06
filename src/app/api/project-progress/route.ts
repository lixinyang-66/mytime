import { NextRequest } from 'next/server';
import { requireSpaceAuthResponse } from '@/lib/auth';
import { isMissingProjectProgressTable, refreshProjectProgressAssessments } from '@/lib/project-progress';

export async function POST(request: NextRequest) {
  const auth = requireSpaceAuthResponse();
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.projectId || 0) || undefined;
  try {
    const assessments = await refreshProjectProgressAssessments(auth.spaceId, projectId);
    return Response.json({ assessments });
  } catch (error) {
    if (isMissingProjectProgressTable(error)) {
      return Response.json({ error: '需要先执行 V2.4 项目真实进度迁移。', migrationRequired: true }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : '评估项目真实进度失败。';
    return Response.json({ error: message }, { status: 500 });
  }
}
