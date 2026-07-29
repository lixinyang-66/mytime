import type { ProjectPhase, ProjectType, SessionOutcome } from '@/types';
import { buildKnowledgeContext, getProjectTypeLabel } from '@/lib/knowledge';

/**
 * AI Plan Generator
 * 根据项目信息自动生成阶段计划
 *
 * 优先使用 DeepSeek V4 Pro 大模型生成定制化计划
 * 未配置 API Key 时降级为规则引擎生成
 */

type PlanInput = {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  dailyStart: string;
  dailyEnd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  projectType: ProjectType;
  projectSubtype?: string | null;
};

type GeneratedPhase = {
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
};

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getMinutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

// === 规则引擎（降级方案） ===

export function generateAIPlan(input: PlanInput): GeneratedPhase[] {
  const totalDays = daysBetween(input.startDate, input.endDate);

  const phaseConfigs = getPhaseConfig(input.difficulty);
  const phases: GeneratedPhase[] = [];
  let currentDay = 0;

  for (let i = 0; i < phaseConfigs.length; i++) {
    const config = phaseConfigs[i];
    const phaseDays = Math.max(3, Math.round(totalDays * config.ratio));
    const phaseStart = addDays(input.startDate, currentDay);
    const phaseEnd = i === phaseConfigs.length - 1
      ? input.endDate
      : addDays(input.startDate, currentDay + phaseDays - 1);

    phases.push({
      name: config.name,
      start_date: phaseStart,
      end_date: phaseEnd,
      sort_order: i + 1,
    });

    currentDay += phaseDays;
    if (currentDay >= totalDays) break;
  }

  return phases;
}

function getPhaseConfig(difficulty: 'easy' | 'medium' | 'hard') {
  const configs = {
    easy: [
      { name: '启动与了解', ratio: 0.3 },
      { name: '核心推进', ratio: 0.4 },
      { name: '收尾与复盘', ratio: 0.3 },
    ],
    medium: [
      { name: '调研与规划', ratio: 0.15 },
      { name: '核心执行', ratio: 0.4 },
      { name: '优化迭代', ratio: 0.25 },
      { name: '验收与总结', ratio: 0.2 },
    ],
    hard: [
      { name: '需求分析与拆解', ratio: 0.1 },
      { name: '方案设计与原型', ratio: 0.15 },
      { name: '核心开发', ratio: 0.35 },
      { name: '测试与优化', ratio: 0.2 },
      { name: '收尾与复盘', ratio: 0.2 },
    ],
  };
  return configs[difficulty];
}

// === DeepSeek V4 Pro 大模型接入 ===

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-pro';

function buildSystemPrompt(): string {
  return `你是 MyTime 的个人项目管理助手，擅长根据项目信息拆解阶段计划。

你的任务：根据用户提供的项目信息，生成合理的项目阶段计划。

要求：
1. 阶段名称必须具体、可执行，与项目目标直接相关（不要使用"启动与了解"这种泛泛的名称）
2. 时间分配要合理：核心执行阶段占更多时间，准备和收尾阶段较短
3. 阶段之间要有逻辑递进关系
4. 所有阶段的日期必须连续覆盖，不能有间隔或重叠
5. 最后一个阶段的结束日期必须等于项目的截止日期

你必须严格返回 JSON 对象，不要包含其他任何文字。对象格式为：
{"phases":[{"name":"阶段名称","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","sort_order":1}]}`;
}

function buildUserPrompt(input: PlanInput): string {
  const totalDays = daysBetween(input.startDate, input.endDate);
  const dailyMinutes = getMinutesBetween(input.dailyStart, input.dailyEnd);
  const difficultyLabel = input.difficulty === 'easy' ? '简单' : input.difficulty === 'hard' ? '困难' : '中等';
  const projectTypeLabel = getProjectTypeLabel(input.projectType);
  const knowledgeContext = buildKnowledgeContext(input.projectType);

  return `请为以下项目生成阶段计划：

项目名称：${input.name}
项目目标：${input.goal}
项目类型：${projectTypeLabel}${input.projectSubtype ? `（${input.projectSubtype}）` : ''}
开始日期：${input.startDate}
截止日期：${input.endDate}（共 ${totalDays} 天）
每天可用时间：${input.dailyStart} - ${input.dailyEnd}（每天 ${dailyMinutes} 分钟）
任务难度：${difficultyLabel}

注意：
- 阶段数量根据难度调整：简单 3 个，中等 4 个，困难 5 个
- 所有日期必须在 ${input.startDate} 到 ${input.endDate} 之间
- 最后一个阶段的 end_date 必须是 ${input.endDate}
- 严格返回 JSON 对象：{"phases":[{"name":"阶段名称（具体、可执行）","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","sort_order":1}]}

可参考的项目知识与方法卡：
${knowledgeContext}`;
}

function parseAIResponse(text: string): GeneratedPhase[] | null {
  const candidates = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.match(/\{[\s\S]*\}/)?.[0], text.match(/\[[\s\S]*\]/)?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim()) as unknown;
      if (Array.isArray(parsed)) return parsed as GeneratedPhase[];
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { phases?: unknown }).phases)) {
        return (parsed as { phases: GeneratedPhase[] }).phases;
      }
    } catch {
      // 继续尝试下一个候选 JSON。
    }
  }
  return null;
}

function validatePhases(phases: GeneratedPhase[], input: PlanInput): boolean {
  if (!phases || phases.length === 0) return false;

  for (const phase of phases) {
    if (!phase.name || !phase.start_date || !phase.end_date) return false;
    if (phase.start_date < input.startDate) return false;
    if (phase.end_date > input.endDate) return false;
    if (phase.start_date > phase.end_date) return false;
  }

  // 最后一个阶段的结束日期应该等于项目结束日期
  const lastPhase = phases[phases.length - 1];
  if (lastPhase.end_date !== input.endDate) return false;

  return true;
}

/**
 * 调用 DeepSeek V4 Pro 生成定制化项目计划
 * 如果 API 调用失败或返回数据不合法，自动降级为规则引擎
 */
export async function generateAIPlanWithLLM(input: PlanInput): Promise<GeneratedPhase[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    // 没有配置 API Key，降级为规则引擎
    return generateAIPlan(input);
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      return generateAIPlan(input);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('DeepSeek API returned empty content');
      return generateAIPlan(input);
    }

    const phases = parseAIResponse(content);

    if (!phases || !validatePhases(phases, input)) {
      console.error('DeepSeek returned invalid phase data, falling back to rule engine');
      return generateAIPlan(input);
    }

    return phases;
  } catch (error) {
    console.error('DeepSeek API call failed:', error);
    // 任何异常都降级为规则引擎，保证项目创建不会失败
    return generateAIPlan(input);
  }
}

export type ReviewSessionInput = {
  studyDate: string;
  durationMinutes: number;
  content: string;
  outcome: SessionOutcome;
  phaseName?: string | null;
};

export type MoodInput = { date: string; label: string };

export type PersonalizedReviewInput = {
  projectName: string;
  projectGoal: string;
  projectType: ProjectType;
  projectSubtype?: string | null;
  periodStart: string;
  periodEnd: string;
  currentPhase?: string | null;
  sessions: ReviewSessionInput[];
  moods: MoodInput[];
  spaceHistory?: string;
};

export type PersonalizedReview = {
  summary: string;
  insights: string;
  nextSteps: string;
};

function buildReviewPrompt(input: PersonalizedReviewInput): string {
  const sessionLines = input.sessions.length
    ? input.sessions.map((session) => `${session.studyDate}｜${session.durationMinutes} 分钟｜${session.outcome}｜${session.phaseName || '未关联阶段'}｜${session.content.slice(0, 180)}`).join('\n')
    : '本周期尚无专注记录。';
  const moodLines = input.moods.length
    ? input.moods.map((mood) => `${mood.date}｜${mood.label}`).join('\n')
    : '本周期未记录状态。';

  return `请为 MyTime 用户生成一份“个人项目周复盘”。

项目：${input.projectName}
项目目标：${input.projectGoal}
项目类型：${getProjectTypeLabel(input.projectType)}${input.projectSubtype ? `（${input.projectSubtype}）` : ''}
复盘周期：${input.periodStart} 至 ${input.periodEnd}
当前阶段：${input.currentPhase || '未设置'}

专注记录：
${sessionLines}

每日状态：
${moodLines}

同一空间的历史投入概览（只用于了解个人基线，不替代本周记录）：
${input.spaceHistory || '历史记录不足。'}

可参考的方法卡：
${buildKnowledgeContext(input.projectType)}

要求：
1. summary 只描述可从记录中确认的事实，避免空泛鼓励；
2. insights 可以指出“个人数据中的线索”，必须使用“可能”“从记录看”等表达，不能声称状态造成了结果，不能进行心理或医学诊断；
3. next_steps 给出不超过 3 条可执行建议，优先服务当前阶段；
4. 若记录不足，明确说明暂不足以判断，并建议先持续记录；
5. 严格返回 JSON 对象：{"summary":"...","insights":"...","next_steps":"..."}。`;
}

function parsePersonalizedReview(text: string): PersonalizedReview | null {
  const candidates = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim()) as Record<string, unknown>;
      const summary = String(parsed.summary || '').trim();
      const insights = String(parsed.insights || '').trim();
      const nextSteps = String(parsed.next_steps || parsed.nextSteps || '').trim();
      if (summary && insights && nextSteps) return { summary, insights, nextSteps };
    } catch {
      // 继续尝试下一个候选 JSON。
    }
  }
  return null;
}

function fallbackPersonalizedReview(input: PersonalizedReviewInput): PersonalizedReview {
  const totalMinutes = input.sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const completedCount = input.sessions.filter((session) => session.outcome === 'completed').length;
  const blocked = input.sessions.filter((session) => session.outcome === 'blocked');
  const totalText = input.sessions.length ? `本周期共记录 ${input.sessions.length} 次专注、${totalMinutes} 分钟，其中 ${completedCount} 次标记为已完成。` : '本周期还没有专注记录，暂时无法判断项目推进情况。';
  const blockedText = blocked.length ? `有 ${blocked.length} 次记录标记为受阻，可在下次复盘时优先说明阻塞原因。` : '目前没有被明确标记为受阻的专注记录。';
  const step = input.currentPhase ? `围绕“${input.currentPhase}”保留 1 项主行动和不超过 2 项辅助行动。` : '先在项目路线图中确认当前阶段，再保留 1 项本周主行动。';
  return {
    summary: totalText,
    insights: `${blockedText} 每日状态仅用于观察个人记录中的线索，不作为对能力或心理状态的判断。`,
    nextSteps: `${step}\n每次专注结束后记录实际完成内容，并标记“已推进、已完成或受阻”。\n周末根据真实记录决定保留、压缩或调整下一步。`,
  };
}

export async function generatePersonalizedReview(input: PersonalizedReviewInput): Promise<PersonalizedReview> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fallbackPersonalizedReview(input);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是谨慎的个人项目复盘助手。只基于用户提供的记录给出建议，不做诊断，不把相关性当作因果。' },
          { role: 'user', content: buildReviewPrompt(input) },
        ],
        temperature: 0.3,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return fallbackPersonalizedReview(input);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const review = content ? parsePersonalizedReview(content) : null;
    return review || fallbackPersonalizedReview(input);
  } catch {
    return fallbackPersonalizedReview(input);
  }
}
