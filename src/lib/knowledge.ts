import type { ProjectType } from '@/types';
import knowledgeBaseJson from '@/data/all_knowledge_base.json';

export type KnowledgeCard = {
  id: string;
  cardType: 'domain' | 'project_management' | 'behavior';
  projectType: ProjectType | 'all';
  title: string;
  content: string;
  sourceNote: string;
};

type KnowledgeBaseEntry = {
  id: string;
  domain_en: string;
  kb_type: string;
  category: string;
  subcategory: string;
  title: string;
  content: string;
  tags?: string[];
};

export const KNOWLEDGE_BASE_REQUIRED_MARKER = '[MYTIME_KNOWLEDGE_BASE_REQUIRED]';

export const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectType; label: string; hint: string }> = [
  { value: 'research', label: '科研', hint: '论文、科研训练、横向/纵向项目、实验' },
  { value: 'fitness', label: '健身', hint: '减脂、减重、增肌、跑步及各类运动' },
  { value: 'competition', label: '比赛', hint: '互联网+、挑战杯、学科与创新创业比赛' },
  { value: 'exam', label: '考试', hint: '期中/期末、考研、考公、考证等备考' },
  { value: 'general', label: '其他长期目标', hint: '暂未归入以上场景的个人长期项目' },
];

// These cards are the small, always-on safety layer for every generated plan.
const cards: KnowledgeCard[] = [
  {
    id: 'research-deliverable', cardType: 'domain', projectType: 'research', title: '科研项目以可检查产出推进',
    content: '将科研工作拆为可检查产出，例如文献矩阵、研究问题、实验记录、可复现数据、图表、章节草稿和修改清单。每个阶段先定义产出，再安排动作。',
    sourceNote: 'MyTime 科研方法卡',
  },
  {
    id: 'research-sequence', cardType: 'domain', projectType: 'research', title: '科研阶段保持证据链',
    content: '论文和实验类项目通常应先澄清问题与资料，再完成研究设计或实验准备，再处理数据与结果，最后写作、修改和交付。计划变化时应说明前置工作是否已经完成。',
    sourceNote: 'MyTime 科研方法卡',
  },
  {
    id: 'fitness-cycle', cardType: 'domain', projectType: 'fitness', title: '健身目标按训练和恢复周期看待',
    content: '健身计划应区分训练、恢复和记录，不用一次训练的体重或表现下结论。优先记录可持续的训练动作、完成量和主观感受。',
    sourceNote: 'MyTime 健身方法卡',
  },
  {
    id: 'competition-milestones', cardType: 'domain', projectType: 'competition', title: '比赛项目优先守住节点',
    content: '比赛类项目先锁定报名、选题、材料提交、答辩或展示等不可错过的节点，再围绕每个节点拆分方案、材料、演练与修改工作。',
    sourceNote: 'MyTime 比赛方法卡',
  },
  {
    id: 'exam-loop', cardType: 'domain', projectType: 'exam', title: '备考用反馈循环替代只看时长',
    content: '备考阶段应在知识覆盖、练习/模拟、错因整理和回顾之间循环。专注记录既要写学习内容，也应标记是否真正解决了一个知识点或错题类型。',
    sourceNote: 'MyTime 备考方法卡',
  },
  {
    id: 'pm-deliverable', cardType: 'project_management', projectType: 'all', title: '从结果倒推阶段',
    content: '先写清项目完成时可被检查的结果，再倒推必须经过的阶段。阶段名应表达产出，而不是只表达投入，例如“完成实验方案”优于“做实验”。',
    sourceNote: 'MyTime 项目管理方法卡',
  },
  {
    id: 'pm-weekly-focus', cardType: 'project_management', projectType: 'all', title: '一周只保留少量推进项',
    content: '本周推进应服务当前阶段，优先保留一项主行动和不超过两项辅助行动。计划的目的不是排满时间，而是让用户每次打开都知道下一步。',
    sourceNote: 'MyTime 项目管理方法卡',
  },
  {
    id: 'pm-replan', cardType: 'project_management', projectType: 'all', title: '偏差需要被重新安排',
    content: '当实际投入或阶段产出低于预期时，先识别阻塞点，再选择保留、压缩、延期或重排；不要把所有未完成事项原样滚入下一周。',
    sourceNote: 'MyTime 项目管理方法卡',
  },
  {
    id: 'behavior-evidence', cardType: 'behavior', projectType: 'all', title: '状态只提供个人线索',
    content: '用户状态可用于观察个人模式，例如哪些类型的工作更容易在不同状态下完成。它不是医学或心理诊断依据，也不能单独决定用户能否完成任务。',
    sourceNote: 'MyTime 行为与状态方法卡',
  },
];

const knowledgeBase = knowledgeBaseJson as KnowledgeBaseEntry[];

export function getProjectTypeLabel(projectType: ProjectType | null | undefined): string {
  return PROJECT_TYPE_OPTIONS.find((item) => item.value === projectType)?.label || '其他长期目标';
}

export function getKnowledgeCardsForProject(projectType: ProjectType): KnowledgeCard[] {
  return cards.filter((card) => card.projectType === projectType || card.projectType === 'all');
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function extractKeywords(query: string): string[] {
  const chunks = normalize(query).match(/[\u4e00-\u9fffA-Za-z0-9]+/g) || [];
  const keywords = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.length >= 2) keywords.add(chunk);
    // Chinese user input often has no spaces. Short n-grams let “毕业论文”
    // match a title such as “本科毕业论文 — 理工科”.
    if (/^[\u4e00-\u9fff]+$/.test(chunk)) {
      for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
        for (let index = 0; index <= chunk.length - size; index += 1) {
          keywords.add(chunk.slice(index, index + size));
        }
      }
    }
  }
  return Array.from(keywords);
}

function getRelevantEntries(projectType: ProjectType, query: string, limit = 8): KnowledgeBaseEntry[] {
  const domains = projectType === 'general'
    ? new Set(['project_management', 'psychology'])
    : new Set([projectType, 'project_management', 'psychology']);
  const keywords = extractKeywords(query);

  return knowledgeBase
    .filter((entry) => domains.has(entry.domain_en))
    .map((entry) => {
      const searchable = normalize([
        entry.title,
        entry.category,
        entry.subcategory,
        ...(entry.tags || []),
      ].join(' '));
      let score = entry.domain_en === projectType ? 12 : entry.domain_en === 'project_management' ? 5 : 2;
      if (entry.kb_type === 'plan_template') score += 3;
      for (const keyword of keywords) {
        if (searchable.includes(keyword)) score += keyword.length >= 4 ? 8 : 3;
      }
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function buildKnowledgeContext(projectType: ProjectType, query = ''): string {
  const staticContext = getKnowledgeCardsForProject(projectType)
    .slice(0, 3)
    .map((card) => `【系统原则｜${card.title}】\n${card.content}`)
    .join('\n');
  const entries = getRelevantEntries(projectType, query);
  const dynamicContext = entries
    .map((entry) => {
      const content = entry.content.length > 1800 ? `${entry.content.slice(0, 1800)}…` : entry.content;
      return `【知识库｜${entry.domain_en}｜${entry.kb_type}｜${entry.title}】\n${content}`;
    })
    .join('\n\n');

  return [
    KNOWLEDGE_BASE_REQUIRED_MARKER,
    '以下是 MyTime 专用知识库检索结果。它们是计划设计的参考约束，不是需要逐字照抄的答案；请结合用户的实际日期、目标、难度和当前进展进行取舍。',
    staticContext,
    dynamicContext,
  ].filter(Boolean).join('\n\n');
}
