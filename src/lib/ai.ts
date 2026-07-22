import type { ProjectPhase } from '@/types';

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
  return `你是一个专业的项目管理助手，擅长根据项目信息拆解阶段计划。

你的任务：根据用户提供的项目信息，生成合理的项目阶段计划。

要求：
1. 阶段名称必须具体、可执行，与项目目标直接相关（不要使用"启动与了解"这种泛泛的名称）
2. 时间分配要合理：核心执行阶段占更多时间，准备和收尾阶段较短
3. 阶段之间要有逻辑递进关系
4. 所有阶段的日期必须连续覆盖，不能有间隔或重叠
5. 最后一个阶段的结束日期必须等于项目的截止日期

你必须严格按照 JSON 数组格式返回，不要包含其他任何文字。`;
}

function buildUserPrompt(input: PlanInput): string {
  const totalDays = daysBetween(input.startDate, input.endDate);
  const dailyMinutes = getMinutesBetween(input.dailyStart, input.dailyEnd);
  const difficultyLabel = input.difficulty === 'easy' ? '简单' : input.difficulty === 'hard' ? '困难' : '中等';

  return `请为以下项目生成阶段计划：

项目名称：${input.name}
项目目标：${input.goal}
开始日期：${input.startDate}
截止日期：${input.endDate}（共 ${totalDays} 天）
每天可用时间：${input.dailyStart} - ${input.dailyEnd}（每天 ${dailyMinutes} 分钟）
任务难度：${difficultyLabel}

请返回 JSON 数组，格式如下：
[
  {
    "name": "阶段名称（具体、可执行）",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "sort_order": 1
  }
]

注意：
- 阶段数量根据难度调整：简单 3 个，中等 4 个，困难 5 个
- 所有日期必须在 ${input.startDate} 到 ${input.endDate} 之间
- 最后一个阶段的 end_date 必须是 ${input.endDate}
- 只返回 JSON 数组，不要任何其他文字`;
}

function parseAIResponse(text: string): GeneratedPhase[] | null {
  try {
    // 尝试直接解析 JSON
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as GeneratedPhase[];
  } catch {
    // 尝试从 markdown 代码块中提取 JSON
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (Array.isArray(parsed)) return parsed as GeneratedPhase[];
      } catch {
        // 继续尝试其他方式
      }
    }

    // 尝试提取第一个 [ 到最后一个 ] 之间的内容
    const bracketMatch = text.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
      try {
        const parsed = JSON.parse(bracketMatch[0]);
        if (Array.isArray(parsed)) return parsed as GeneratedPhase[];
      } catch {
        // 解析失败
      }
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
        temperature: 0.7,
        max_tokens: 2000,
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
