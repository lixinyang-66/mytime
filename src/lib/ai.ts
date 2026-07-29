import type { Difficulty, ProjectPhase, ProjectType, SessionOutcome } from '@/types';
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
  difficulty: Difficulty;
  projectType: ProjectType;
  projectSubtype?: string | null;
  initialStatusNote?: string;
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
  // 项目周期不足以容纳所有阶段时，优先保证日期连续且不越界。
  const phaseConfigs = getPhaseConfig(input.projectType, input.difficulty).slice(0, totalDays);
  const phases: GeneratedPhase[] = [];
  let currentDay = 0;

  for (let i = 0; i < phaseConfigs.length; i++) {
    const config = phaseConfigs[i];
    const remainingDays = totalDays - currentDay;
    const remainingRatio = phaseConfigs.slice(i).reduce((sum, phase) => sum + phase.ratio, 0);
    const phaseDays = i === phaseConfigs.length - 1
      ? remainingDays
      : Math.max(1, Math.round((remainingDays * config.ratio) / remainingRatio));
    const phaseStart = addDays(input.startDate, currentDay);
    const phaseEnd = addDays(input.startDate, currentDay + phaseDays - 1);

    phases.push({
      name: config.name,
      start_date: phaseStart,
      end_date: phaseEnd,
      sort_order: i + 1,
    });

    currentDay += phaseDays;
  }

  return phases;
}

type PhaseConfig = { name: string; ratio: number };

const phaseNamesByType: Record<ProjectType, Record<Difficulty, string[]>> = {
  research: {
    easy: ['明确研究问题与交付物', '研究/写作核心推进', '修改提交与复盘'],
    medium: ['明确研究问题与资料清单', '文献梳理与研究框架', '研究/实验执行与材料整理', '写作修改与提交'],
    hard: ['研究问题与任务拆解', '文献梳理与方法设计', '研究/实验执行', '写作打磨与修改', '成果提交与复盘'],
  },
  fitness: {
    easy: ['建立身体基线与目标', '稳定训练与饮食执行', '记录复盘与习惯巩固'],
    medium: ['建立身体基线与目标', '安排训练与饮食节奏', '持续训练、恢复与数据记录', '依据数据调整并复盘'],
    hard: ['建立身体基线与目标', '制定训练、饮食与恢复方案', '稳定训练与饮食执行', '依据数据动态调整', '阶段评估与习惯巩固'],
  },
  competition: {
    easy: ['明确赛题与交付要求', '完成作品/材料核心部分', '提交前打磨与复盘'],
    medium: ['选题与报名准备', '方案设计与分工拆解', '作品开发与材料完善', '提交演练与复盘'],
    hard: ['赛题分析与资源准备', '方案设计与任务拆解', '作品开发与阶段验证', '材料打磨与答辩演练', '正式提交与复盘'],
  },
  exam: {
    easy: ['诊断基础与明确目标', '核心知识学习与练习', '模拟检查与复盘'],
    medium: ['诊断基础与制定目标', '核心模块学习', '刷题与错题回顾', '模拟冲刺与复盘'],
    hard: ['诊断基础与目标拆解', '系统学习核心模块', '专项刷题与错题整理', '模考复盘与薄弱项补强', '冲刺巩固与应试准备'],
  },
  general: {
    easy: ['明确目标与行动边界', '完成核心行动', '成果整理与复盘'],
    medium: ['明确目标与现状', '制定行动方案', '核心行动与记录', '成果整理与复盘'],
    hard: ['目标拆解与现状盘点', '制定行动方案与资源准备', '核心行动推进', '检查调整与风险处理', '成果整理与复盘'],
  },
};

function getPhaseConfig(projectType: ProjectType, difficulty: Difficulty): PhaseConfig[] {
  const names = phaseNamesByType[projectType][difficulty];
  const ratios = names.length === 3
    ? [0.25, 0.55, 0.2]
    : names.length === 4
      ? [0.15, 0.25, 0.4, 0.2]
      : [0.1, 0.15, 0.4, 0.2, 0.15];
  return names.map((name, index) => ({ name, ratio: ratios[index] }));
}

// === DeepSeek V4 Pro 大模型接入 ===

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-pro';

export type ProjectClassification = {
  projectType: ProjectType;
  projectSubtype: string | null;
  difficulty: Difficulty;
};

const projectTypes: ProjectType[] = ['research', 'fitness', 'competition', 'exam', 'general'];
const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

function fallbackProjectClassification(name: string, goal: string): ProjectClassification {
  const text = `${name} ${goal}`.toLowerCase();
  if (/(论文|科研|课题|实验|文献|研究|横向|纵向|毕业设计)/.test(text)) return { projectType: 'research', projectSubtype: null, difficulty: 'hard' };
  if (/(健身|减脂|减重|增肌|跑步|运动|训练|体脂)/.test(text)) return { projectType: 'fitness', projectSubtype: null, difficulty: 'medium' };
  if (/(比赛|竞赛|挑战杯|互联网\+|创新创业|答辩|参赛)/.test(text)) return { projectType: 'competition', projectSubtype: null, difficulty: 'hard' };
  if (/(考试|备考|考研|考公|考证|期中|期末|雅思|托福|四六级)/.test(text)) return { projectType: 'exam', projectSubtype: null, difficulty: 'medium' };
  return { projectType: 'general', projectSubtype: null, difficulty: 'medium' };
}

function parseProjectClassification(text: string): ProjectClassification | null {
  const candidates = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim()) as Record<string, unknown>;
      const projectType = String(parsed.project_type || parsed.projectType || '');
      if (!projectTypes.includes(projectType as ProjectType)) continue;
      const subtype = String(parsed.project_subtype || parsed.projectSubtype || '').trim();
      const difficulty = String(parsed.difficulty || '').trim();
      return {
        projectType: projectType as ProjectType,
        projectSubtype: subtype ? subtype.slice(0, 40) : null,
        difficulty: difficulties.includes(difficulty as Difficulty) ? difficulty as Difficulty : 'medium',
      };
    } catch {
      // 尝试下一个可能的 JSON 内容。
    }
  }
  return null;
}

/** 根据用户填写的项目名称与目标自动归类，接口不可用时降级为关键词归类。 */
export async function classifyProjectWithLLM(input: { name: string; goal: string }): Promise<ProjectClassification> {
  const fallback = fallbackProjectClassification(input.name, input.goal);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[ai:classification] DEEPSEEK_API_KEY is not configured; using keyword fallback.');
    return fallback;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是个人长期项目分类器。仅根据用户给出的项目名称和目标分类，不要推测敏感信息。难度表示项目的拆解复杂度，不表示用户能力。' },
          { role: 'user', content: `项目名称：${input.name}\n项目目标：${input.goal}\n\n请在 research（科研）、fitness（健身）、competition（比赛）、exam（考试）、general（其他长期目标）中选一个最贴切的类型，给出简短细分方向，并推断计划拆解难度（easy、medium、hard）。严格返回 JSON：{"project_type":"research","project_subtype":"毕业论文","difficulty":"hard"}。若无法细分，project_subtype 为空字符串。` },
        ],
        temperature: 0,
        max_tokens: 180,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      console.warn(`[ai:classification] DeepSeek returned HTTP ${response.status}; using keyword fallback.`);
      return fallback;
    }
    const data = await response.json();
    const classification = parseProjectClassification(data.choices?.[0]?.message?.content || '');
    if (!classification) {
      console.warn('[ai:classification] DeepSeek response could not be parsed; using keyword fallback.');
      return fallback;
    }
    console.info(`[ai:classification] DeepSeek classified project as ${classification.projectType}.`);
    return classification;
  } catch (error) {
    console.error('[ai:classification] DeepSeek request failed; using keyword fallback.', error instanceof Error ? error.message : error);
    return fallback;
  }
}

function buildSystemPrompt(): string {
  return `你是 MyTime 的个人项目管理助手，擅长根据项目信息拆解阶段计划。

你的任务：根据用户提供的项目信息，生成合理的项目阶段计划。

要求：
1. 阶段名称必须具体、可执行，与项目目标直接相关（不要使用"启动与了解"这种泛泛的名称）
2. 时间分配要合理：核心执行阶段占更多时间，准备和收尾阶段较短
3. 阶段之间要有逻辑递进关系
4. 所有阶段的日期必须连续覆盖，不能有间隔或重叠
5. 最后一个阶段的结束日期必须等于项目的截止日期
6. 必须遵循项目类型，不得套用其他领域的模板。尤其当项目类型为 fitness 时，阶段必须体现训练、饮食、恢复或数据记录，严禁出现论文、文献、调研、实验、写作等科研阶段。

你必须严格返回 JSON 对象，不要包含其他任何文字。对象格式为：
{"phases":[{"name":"阶段名称","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","sort_order":1}]}`;
}

function buildUserPrompt(input: PlanInput): string {
  const totalDays = daysBetween(input.startDate, input.endDate);
  const dailyMinutes = getMinutesBetween(input.dailyStart, input.dailyEnd);
  const difficultyLabel = input.difficulty === 'easy' ? '简单' : input.difficulty === 'hard' ? '困难' : '中等';
  const projectTypeLabel = getProjectTypeLabel(input.projectType);
  const knowledgeContext = buildKnowledgeContext(input.projectType);
  const domainRequirement = input.projectType === 'fitness'
    ? '这是健身项目。阶段必须围绕身体基线、训练、饮食、恢复和记录展开；不得使用科研或论文类阶段名称。'
    : input.projectType === 'research'
      ? '这是科研项目。阶段应围绕研究问题、文献/方法、研究或实验、写作修改与交付展开。'
      : input.projectType === 'competition'
        ? '这是比赛项目。阶段应围绕赛题、方案、作品/材料、演练和提交展开。'
        : input.projectType === 'exam'
          ? '这是考试项目。阶段应围绕诊断、学习、练习/错题、模考与冲刺展开。'
          : '阶段应直接服务于项目目标，避免使用其他领域的术语。';

  return `请为以下项目生成阶段计划：

项目名称：${input.name}
项目目标：${input.goal}
项目类型：${projectTypeLabel}${input.projectSubtype ? `（${input.projectSubtype}）` : ''}
项目当前进展：${input.initialStatusNote?.trim() || '未提供，请从项目起点安排'}
开始日期：${input.startDate}
截止日期：${input.endDate}（共 ${totalDays} 天）
每天可用时间：${input.dailyStart} - ${input.dailyEnd}（每天 ${dailyMinutes} 分钟）
任务难度：${difficultyLabel}

注意：
- 阶段数量根据难度调整：简单 3 个，中等 4 个，困难 5 个
- 所有日期必须在 ${input.startDate} 到 ${input.endDate} 之间
- 最后一个阶段的 end_date 必须是 ${input.endDate}
- 领域约束：${domainRequirement}
- 如已提供项目当前进展，请避免重复安排其中已经完成的工作；将阶段从当前状态起合理衔接。
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

  for (let index = 0; index < phases.length; index++) {
    const phase = phases[index];
    if (!phase.name || !phase.start_date || !phase.end_date) return false;
    if (phase.start_date < input.startDate) return false;
    if (phase.end_date > input.endDate) return false;
    if (phase.start_date > phase.end_date) return false;
    const expectedStart = index === 0 ? input.startDate : addDays(phases[index - 1].end_date, 1);
    if (phase.start_date !== expectedStart) return false;
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
export type PlanGenerationSource = 'deepseek' | 'fallback';
export type GeneratedPlanResult = { phases: GeneratedPhase[]; planSource: PlanGenerationSource };

export async function generateAIPlanWithDiagnostics(input: PlanInput): Promise<GeneratedPlanResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn('[ai:plan] DEEPSEEK_API_KEY is not configured; using domain fallback.');
    return { phases: generateAIPlan(input), planSource: 'fallback' };
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
      console.warn(`[ai:plan] DeepSeek returned HTTP ${response.status}; using domain fallback.`);
      return { phases: generateAIPlan(input), planSource: 'fallback' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('[ai:plan] DeepSeek returned empty content; using domain fallback.');
      return { phases: generateAIPlan(input), planSource: 'fallback' };
    }

    const phases = parseAIResponse(content);

    if (!phases || !validatePhases(phases, input)) {
      console.warn('[ai:plan] DeepSeek returned invalid phase data; using domain fallback.');
      return { phases: generateAIPlan(input), planSource: 'fallback' };
    }

    console.info('[ai:plan] DeepSeek generated a project plan successfully.');
    return { phases, planSource: 'deepseek' };
  } catch (error) {
    console.error('[ai:plan] DeepSeek request failed; using domain fallback.', error instanceof Error ? error.message : error);
    // 任何异常都降级为规则引擎，保证项目创建不会失败
    return { phases: generateAIPlan(input), planSource: 'fallback' };
  }
}

// 保持已有调用方兼容；需要追踪来源时使用 generateAIPlanWithDiagnostics。
export async function generateAIPlanWithLLM(input: PlanInput): Promise<GeneratedPhase[]> {
  return (await generateAIPlanWithDiagnostics(input)).phases;
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
