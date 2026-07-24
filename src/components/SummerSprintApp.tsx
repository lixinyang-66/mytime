/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import type { Space, SpaceMood, ProjectSummary, Project, ProjectPhase, TaskBoard, TaskKind, WeeklyPlan, WeeklyPlanItem, StudySession, Review, Difficulty } from '@/types';
import { formatChineseDate, getWeekEnd, getWeekStart, minutesToText, timeToToday, toDateKey, weekdayText } from '@/lib/date';
import { getMoodByKey, MOODS } from '@/lib/moods';
import MoodRainLoader from '@/components/MoodRainLoader';

const boardColors = [
  'bg-orange-100 text-orange-800 ring-orange-200',
  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  'bg-sky-100 text-sky-800 ring-sky-200',
  'bg-yellow-100 text-yellow-800 ring-yellow-200',
  'bg-violet-100 text-violet-800 ring-violet-200',
  'bg-rose-100 text-rose-800 ring-rose-200',
];

function getMinutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

type View = 'space' | 'project';
type ProjectMode = 'home' | 'gantt' | 'focus' | 'finish' | 'plan' | 'stats' | 'boards' | 'review';

type RunningSession = { taskBoardId: number; startAt: string; pausedMs: number };

type SpaceData = { space: Space; projects: ProjectSummary[]; moods: SpaceMood[] };

type ProjectData = {
  project: Project;
  phases: ProjectPhase[];
  taskBoards: TaskBoard[];
  currentPlan: WeeklyPlan | null;
  currentPlanItems: WeeklyPlanItem[];
  recentSessions: StudySession[];
  recentReviews: Review[];
  stats: { todayMinutes: number; weekMinutes: number; monthMinutes: number; totalMinutes: number; weekTargetMinutes: number; completionRate: number; streakDays: number; byBoardThisWeek: Record<number, number> };
};

export default function MyTimeApp() {
  const [view, setView] = useState<View>('space');
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [mode, setMode] = useState<ProjectMode>('home');
  const [session, setSession] = useState<RunningSession | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [recordFilter, setRecordFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    loadSpace();
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadSpace() {
    setLoading(true); setError('');
    const response = await fetch('/api/bootstrap');
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '读取空间数据失败。'); return; }
    setSpaceData(payload);
  }

  async function loadProject(projectId: number) {
    setLoading(true); setError('');
    const response = await fetch(`/api/project-detail?projectId=${projectId}`);
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '读取项目数据失败。'); return; }
    setProjectData(payload);
    setSelectedProjectId(projectId);
    setView('project');
    setMode('home');
  }

  async function refreshProject() {
    if (!selectedProjectId) return;
    await loadProject(selectedProjectId);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setView('space');
    setProjectData(null);
    setSelectedProjectId(null);
    await loadSpace();
  }

  const planItems = useMemo(() => projectData?.currentPlanItems || [], [projectData?.currentPlanItems]);
  const activeBoards = useMemo(() => planItems.map((item) => item.task_board).filter(Boolean) as TaskBoard[], [planItems]);
  const fallbackBoard = projectData?.taskBoards[0];
  const suggestedBoardId = activeBoards[0]?.id || fallbackBoard?.id || 0;
  const startTime = projectData?.project.daily_start_time || '19:30';
  const endTime = projectData?.project.daily_end_time || '23:30';

  const elapsedSeconds = useMemo(() => {
    if (!session) return 0;
    const start = new Date(session.startAt).getTime();
    const runningUntil = paused && pauseStartedAt ? pauseStartedAt : now.getTime();
    return Math.max(0, Math.floor((runningUntil - start - session.pausedMs) / 1000));
  }, [session, now, paused, pauseStartedAt]);

  function startFocus(taskBoardId = suggestedBoardId) {
    if (!taskBoardId) {
      alert('请先创建任务板块，并在本周计划中至少选择 1 个任务板块。');
      setMode('plan');
      return;
    }
    setSession({ taskBoardId, startAt: new Date().toISOString(), pausedMs: 0 });
    setPaused(false); setPauseStartedAt(null); setContent(''); setMode('focus');
  }

  function togglePause() {
    if (!session) return;
    if (paused) {
      const extra = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
      setSession({ ...session, pausedMs: session.pausedMs + extra });
      setPauseStartedAt(null); setPaused(false);
    } else {
      setPauseStartedAt(Date.now()); setPaused(true);
    }
  }

  function goFinish() {
    if (!session) return;
    setPaused(true);
    if (!pauseStartedAt) setPauseStartedAt(Date.now());
    setMode('finish');
  }

  async function saveSession() {
    if (!session || !selectedProjectId) return;
    if (!content.trim()) { alert('请填写这段时间你真正做了什么。'); return; }
    setSaving(true);
    const start = new Date(session.startAt);
    const end = new Date();
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: selectedProjectId,
        study_date: toDateKey(start),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: Math.max(1, Math.round(elapsedSeconds / 60)),
        task_board_id: session.taskBoardId,
        content,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '保存失败，请稍后重试。'); return; }
    setSession(null); setPaused(false); setPauseStartedAt(null); setMode('home');
    await refreshProject();
  }

  if (loading) return <MoodRainLoader />;
  if (error) return <Shell><ErrorCard message={error} onRetry={() => view === 'project' ? refreshProject() : loadSpace()} /></Shell>;

  if (view === 'space' && spaceData) {
    return (
      <Shell>
        <SpaceView
          space={spaceData.space}
          projects={spaceData.projects}
          moods={spaceData.moods}
          onOpenProject={(id) => loadProject(id)}
          onRefresh={loadSpace}
          onLogout={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}
        />
      </Shell>
    );
  }

  if (view === 'project' && projectData) {
    const sessionBoard = session ? projectData.taskBoards.find((b) => b.id === session.taskBoardId) : null;
    return (
      <Shell>
        {mode === 'home' && (
          <ProjectHomeView
            now={now} data={projectData} startTime={startTime} endTime={endTime}
            onStart={() => startFocus()} onPlan={() => setMode('plan')} onStats={() => setMode('stats')}
            onBoards={() => setMode('boards')} onGantt={() => setMode('gantt')} onReview={() => setMode('review')}
            onBack={() => { setView('space'); setProjectData(null); setSelectedProjectId(null); }}
            recordFilter={recordFilter} onRecordFilter={setRecordFilter}
          />
        )}
        {mode === 'gantt' && <GanttView data={projectData} onBack={() => setMode('home')} onRefresh={refreshProject} />}
        {mode === 'focus' && session && (
          <FocusView
            boards={activeBoards.length ? activeBoards : projectData.taskBoards}
            session={session} board={sessionBoard} elapsedSeconds={elapsedSeconds}
            paused={paused} onPause={togglePause} onFinish={goFinish}
            onChangeBoard={(taskBoardId) => setSession({ ...session, taskBoardId })}
          />
        )}
        {mode === 'finish' && session && (
          <FinishView board={sessionBoard} elapsedSeconds={elapsedSeconds} content={content} saving={saving}
            onContent={setContent} onBack={() => setMode('focus')} onSave={saveSession} />
        )}
        {mode === 'plan' && <PlanView data={projectData} projectId={selectedProjectId!} onBack={() => setMode('home')} onBoards={() => setMode('boards')} onSaved={async () => { await refreshProject(); setMode('home'); }} />}
        {mode === 'boards' && <BoardsView boards={projectData.taskBoards} projectId={selectedProjectId!} onBack={() => setMode('home')} onSaved={refreshProject} />}
        {mode === 'stats' && <StatsView data={projectData} onBack={() => setMode('home')} />}
        {mode === 'review' && <ReviewView data={projectData} projectId={selectedProjectId!} onBack={() => setMode('home')} onRefresh={refreshProject} />}
      </Shell>
    );
  }

  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="safe-bottom mx-auto min-h-screen w-full max-w-3xl px-4 py-5 text-ink sm:px-6">{children}</main>;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-20 rounded-[2rem] bg-white/85 p-7 shadow-soft">
      <h1 className="text-2xl font-black">加载失败</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      <button onClick={onRetry} className="mt-6 rounded-2xl bg-ink px-5 py-3 font-bold text-white">重新读取</button>
    </div>
  );
}

// === SPACE VIEW ===
function SpaceView({ space, projects, moods, onOpenProject, onRefresh, onLogout }: {
  space: Space; projects: ProjectSummary[]; moods: SpaceMood[]; onOpenProject: (id: number) => void; onRefresh: () => void; onLogout: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(toDateKey(new Date()));
  const [endDate, setEndDate] = useState('');
  const [dailyStart, setDailyStart] = useState('19:30');
  const [dailyEnd, setDailyEnd] = useState('23:30');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [useAI, setUseAI] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [moodRecords, setMoodRecords] = useState(moods);
  const [moodSaving, setMoodSaving] = useState('');
  const [moodError, setMoodError] = useState('');
  const [moodPage, setMoodPage] = useState(0);
  const [turningMoodHandle, setTurningMoodHandle] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const todayKey = toDateKey(new Date());
  const todayMood = moodRecords.find((mood) => mood.mood_date === todayKey);
  const moodPages = Math.ceil(MOODS.length / 4);
  const visibleMoods = MOODS.slice(moodPage * 4, moodPage * 4 + 4);

  useEffect(() => setMoodRecords(moods), [moods]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !goal.trim() || !endDate) { setError('请填写项目名称、目标和截止日期。'); return; }
    setSaving(true); setError('');
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, goal, start_date: startDate, end_date: endDate, daily_start_time: dailyStart, daily_end_time: dailyEnd, difficulty, use_ai_plan: useAI }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(payload.error || '创建项目失败。'); return; }
    setShowCreate(false);
    setName(''); setGoal(''); setEndDate('');
    await onRefresh();
  }

  async function saveMood(moodKey: string) {
    setMoodSaving(moodKey);
    setMoodError('');
    const response = await fetch('/api/space-moods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moodKey, moodDate: todayKey }),
    });
    const payload = await response.json().catch(() => ({}));
    setMoodSaving('');
    if (!response.ok) { setMoodError(payload.error || '保存今天的状态失败。'); return; }
    setMoodRecords((current) => [...current.filter((mood) => mood.mood_date !== todayKey), payload]);
  }

  function turnMoodHandle() {
    if (turningMoodHandle) return;
    setTurningMoodHandle(true);
    window.setTimeout(() => {
      setMoodPage((current) => (current + 1) % moodPages);
      setTurningMoodHandle(false);
    }, 260);
  }

  async function deleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(`确定删除项目“${project.name}”吗？项目下的计划、记录、阶段和复盘也会被永久删除。`);
    if (!confirmed) return;

    setDeletingProjectId(project.id);
    const response = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setDeletingProjectId(null);
    if (!response.ok) { setError(payload.error || '删除项目失败。'); return; }
    await onRefresh();
  }

  return (
    <div className="rounded-[2.5rem] bg-[#fff7ea] p-5 shadow-soft sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <div title={space.name}>
          <p className="text-base font-black text-orange-700">MyTime</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">我的空间</h1>
        </div>
        <button onClick={onLogout} className="shrink-0 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-500 shadow-sm">退出空间</button>
      </header>

      <section className="mt-7 rounded-[2rem] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-500">今天状态怎么样呀~</h2>
            {todayMood ? <p className="mt-2 text-sm font-bold text-orange-700">今天选择了：{getMoodByKey(todayMood.mood_key)?.label || '一个表情'}</p> : <p className="mt-2 text-sm font-bold text-slate-400">选一个表情，贴到今天的日历上。</p>}
          </div>
          {todayMood ? <img src={getMoodByKey(todayMood.mood_key)?.src} alt={getMoodByKey(todayMood.mood_key)?.label || '今日状态'} className="h-16 w-16 rounded-2xl object-cover" /> : null}
        </div>
        <div className="mt-5 rounded-[1.6rem] border border-orange-100 bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 p-3">
          <div className="grid grid-cols-4 gap-2.5">
          {visibleMoods.map((mood) => {
            const selected = todayMood?.mood_key === mood.key;
            return (
              <button
                key={mood.key}
                type="button"
                onClick={() => saveMood(mood.key)}
                disabled={Boolean(moodSaving) || turningMoodHandle}
                className={`rounded-2xl p-1.5 text-center transition disabled:opacity-50 ${selected ? 'bg-honey ring-2 ring-orange-300' : 'bg-cream/70 ring-1 ring-orange-100 hover:-translate-y-0.5'}`}
                title={mood.label}
              >
                <img src={mood.src} alt={mood.label} className="mx-auto h-12 w-12 rounded-xl object-cover" />
                <span className="mt-1 block truncate text-[10px] font-black text-slate-600">{moodSaving === mood.key ? '保存中' : mood.label}</span>
              </button>
            );
          })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/75 px-3 py-2.5 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-600">扭蛋机 · 第 {moodPage + 1} / {moodPages} 批</p>
              <div className="mt-1 flex gap-1.5" aria-label={`第 ${moodPage + 1} 批，共 ${moodPages} 批`}>
                {Array.from({ length: moodPages }, (_, index) => (
                  <span key={index} className={`h-1.5 w-1.5 rounded-full ${index === moodPage ? 'bg-orange-400' : 'bg-orange-100'}`} />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={turnMoodHandle}
              disabled={turningMoodHandle || Boolean(moodSaving)}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-black text-white transition active:scale-95 disabled:opacity-60"
              aria-label="转动扭蛋机把手，换一批表情"
            >
              <span className={`inline-flex h-5 w-2 origin-bottom items-start justify-center rounded-full bg-orange-300 transition-transform duration-300 ${turningMoodHandle ? 'rotate-[-38deg]' : 'rotate-[28deg]'}`}>
                <span className="-mt-1 h-3 w-3 rounded-full bg-coral ring-2 ring-white" />
              </span>
              换一批
            </button>
          </div>
        </div>
        {moodError ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{moodError}</p> : null}
      </section>

      <MoodCalendar moods={moodRecords} />

      <button onClick={() => setShowCreate(!showCreate)} className="mt-7 w-full rounded-[1.8rem] bg-ink px-6 py-5 text-lg font-black text-white shadow-lg transition active:scale-[0.99]">{showCreate ? '取消创建' : '＋ 创建新项目'}</button>

      {showCreate ? (
        <section className="mt-5 rounded-[2rem] bg-white/90 p-6 shadow-soft">
          <h2 className="text-xl font-black">创建项目</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">填写基本信息，AI 将根据你的项目自动生成阶段计划</p>
          {error ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
          <form onSubmit={createProject} className="mt-4 space-y-4">
            <Field label="项目名称" value={name} onChange={setName} />
            <Field label="项目目标" value={goal} onChange={setGoal} multiline />
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始日期" type="date" value={startDate} onChange={setStartDate} />
              <Field label="截止日期" type="date" value={endDate} onChange={setEndDate} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="每天开始" type="time" value={dailyStart} onChange={setDailyStart} />
              <Field label="每天结束" type="time" value={dailyEnd} onChange={setDailyEnd} />
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">任务难度</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100">
                <option value="easy">简单：3 个阶段</option>
                <option value="medium">中等：4 个阶段</option>
                <option value="hard">困难：5 个阶段</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-sky-50 p-4">
              <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} className="h-5 w-5 rounded" />
              <div>
                <p className="text-sm font-black text-sky-800">AI 自动生成项目计划</p>
                <p className="text-xs font-bold text-sky-600">根据目标、时间和难度自动生成阶段甘特图</p>
              </div>
            </label>
            <button type="submit" disabled={saving} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在创建...' : '创建项目'}</button>
          </form>
        </section>
      ) : null}

      <section className="mt-7 space-y-4">
        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
        {projects.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-black text-slate-600">还没有项目</p>
            <p className="mt-2 text-sm font-bold text-slate-500">点击上方按钮创建你的第一个项目</p>
          </div>
        ) : projects.map((project) => (
          <SwipeProjectCard
            key={project.id}
            project={project}
            deleting={deletingProjectId === project.id}
            onOpen={() => onOpenProject(project.id)}
            onDelete={() => deleteProject(project)}
          />
        ))}
      </section>
    </div>
  );
}

function MoodCalendar({ moods }: { moods: SpaceMood[] }) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const moodByDate = useMemo(() => new Map(moods.map((mood) => [mood.mood_date, mood])), [moods]);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const todayKey = toDateKey(now);

  function changeMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section className="mt-5 rounded-[2rem] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-400">状态日历</p>
          <h2 className="text-xl font-black">{year} 年 {monthIndex + 1} 月</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="h-10 w-10 rounded-full bg-cream font-black text-slate-600">‹</button>
          <button type="button" onClick={() => changeMonth(1)} className="h-10 w-10 rounded-full bg-cream font-black text-slate-600">›</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-400">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: cellCount }, (_, index) => {
          const day = index - firstWeekday + 1;
          if (day < 1 || day > daysInMonth) return <div key={`empty-${index}`} className="min-h-14" aria-hidden="true" />;
          const dateKey = toDateKey(new Date(year, monthIndex, day));
          const mood = moodByDate.get(dateKey);
          const moodInfo = getMoodByKey(mood?.mood_key);
          const isToday = dateKey === todayKey;
          return (
            <div key={dateKey} className={`relative flex min-h-14 flex-col items-center justify-center rounded-2xl ${isToday ? 'bg-honey/70 ring-2 ring-orange-200' : 'bg-cream/60'}`} title={moodInfo?.label}>
              <span className={`text-xs font-black ${isToday ? 'text-orange-800' : 'text-slate-500'}`}>{day}</span>
              {moodInfo ? <img src={moodInfo.src} alt={moodInfo.label} className="mt-1 h-7 w-7 rounded-full object-cover" /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SwipeProjectCard({ project, deleting, onOpen, onDelete }: {
  project: ProjectSummary; deleting: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const statusClass = project.status === 'active' ? 'bg-emerald-100 text-emerald-800' : project.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600';
  const statusText = project.status === 'active' ? '进行中' : project.status === 'paused' ? '暂停' : '已完成';

  function finishSwipe() {
    const shouldOpen = offset < -56;
    suppressClick.current = true;
    setOffset(shouldOpen ? -108 : 0);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-red-500">
      <button type="button" onClick={onDelete} disabled={deleting} className="absolute inset-y-0 right-0 flex w-28 items-center justify-center bg-red-500 text-sm font-black text-white disabled:opacity-60">
        {deleting ? '删除中...' : '删除'}
      </button>
      <button
        type="button"
        onTouchStart={(event: TouchEvent<HTMLButtonElement>) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
        onTouchMove={(event: TouchEvent<HTMLButtonElement>) => {
          if (touchStartX.current === null) return;
          const currentX = event.touches[0]?.clientX;
          if (currentX === undefined) return;
          const nextOffset = Math.min(0, Math.max(-108, currentX - touchStartX.current));
          setOffset(nextOffset);
        }}
        onTouchEnd={finishSwipe}
        onTouchCancel={() => setOffset(0)}
        onClick={() => {
          if (suppressClick.current || offset < 0) { setOffset(0); return; }
          onOpen();
        }}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        className="relative z-10 flex w-full items-center justify-between gap-4 rounded-[2rem] bg-white p-6 text-left shadow-sm transition-transform duration-200"
      >
        <div className="min-w-0">
          <p className="truncate text-2xl font-black">{project.name}</p>
          <p className="mt-2 text-sm font-bold text-slate-500">{project.start_date} → {project.end_date}</p>
          <p className="mt-3 text-xs font-bold text-slate-400">向左滑动可删除</p>
        </div>
        <span className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${statusClass}`}>{statusText}</span>
      </button>
    </div>
  );
}

// === PROJECT HOME VIEW ===
function ProjectHomeView({ now, data, startTime, endTime, onStart, onPlan, onStats, onBoards, onGantt, onReview, onBack, recordFilter, onRecordFilter }: {
  now: Date; data: ProjectData; startTime: string; endTime: string;
  onStart: () => void; onPlan: () => void; onStats: () => void; onBoards: () => void;
  onGantt: () => void; onReview: () => void; onBack: () => void;
  recordFilter: number | 'all'; onRecordFilter: (v: number | 'all') => void;
}) {
  const status = getStudyStatus(now, startTime, endTime);
  const activeBoards = data.currentPlanItems.map((item) => item.task_board).filter(Boolean) as TaskBoard[];
  const activeBoardIds = new Set(activeBoards.map((b) => b.id));
  const recentRecords = data.recentSessions.filter((item) => activeBoardIds.has(item.task_board_id));
  const filteredRecords = recordFilter === 'all' ? recentRecords : recentRecords.filter((item) => item.task_board_id === recordFilter);
  const planTotal = data.currentPlanItems.reduce((acc, item) => acc + item.daily_minutes, 0);
  const targetMinutes = getMinutesBetween(startTime, endTime);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-bold text-orange-700">MyTime · {data.project.name}</p>
          <h1 className="text-3xl font-black tracking-tight">{formatChineseDate(now)} · {weekdayText(now)}</h1>
        </div>
        <button onClick={onBack} className="rounded-full bg-white/70 px-4 py-2 text-xs font-bold text-slate-500 shadow-sm">返回空间</button>
      </header>

      <section className="overflow-hidden rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white">
        <p className="text-sm font-bold text-slate-500">项目目标</p>
        <h2 className="mt-2 text-base font-black leading-7 text-slate-700">{data.project.goal || data.project.total_goal}</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold text-slate-600">
          <div className="rounded-2xl bg-cream p-4">开始：{data.project.start_date}</div>
          <div className="rounded-2xl bg-cream p-4">截止：{data.project.end_date}</div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${data.project.plan_source === 'ai' ? 'bg-sky-100 text-sky-800' : data.project.plan_source === 'modified' ? 'bg-violet-100 text-violet-800' : 'bg-cream text-slate-600'}`}>
            {data.project.plan_source === 'ai' ? 'AI 计划' : data.project.plan_source === 'modified' ? '手动修改' : '手动计划'}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${data.project.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-800' : data.project.difficulty === 'hard' ? 'bg-rose-100 text-rose-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {data.project.difficulty === 'easy' ? '简单' : data.project.difficulty === 'hard' ? '困难' : '中等'}
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-500">每天固定时间</p>
            <p className="mt-2 text-4xl font-black tracking-tight">{startTime}—{endTime}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">共 {targetMinutes} 分钟</p>
          </div>
          <div className="rounded-2xl bg-honey/80 px-4 py-3 text-right">
            <p className="text-xs font-bold text-orange-700">当前状态</p>
            <p className="text-sm font-black text-orange-900">{status.label}</p>
          </div>
        </div>
        <div className="mt-7 rounded-[1.6rem] bg-cream px-5 py-4">
          <p className="text-sm font-bold text-slate-500">{status.prefix}</p>
          <p className="mt-1 text-2xl font-black">{status.text}</p>
        </div>
        <button onClick={onStart} className="mt-6 w-full rounded-[1.7rem] bg-gradient-to-r from-orange-400 to-amber-300 px-6 py-5 text-lg font-black text-white shadow-lg shadow-orange-100 active:scale-[0.99]">
          开始记录这一段时间
        </button>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onGantt} className="rounded-2xl bg-sky-100 p-4 text-center">
          <p className="text-xs font-black text-sky-800">项目甘特图</p>
          <p className="mt-1 text-lg font-black text-sky-900">{data.phases.length} 阶段</p>
        </button>
        <button onClick={onPlan} className="rounded-2xl bg-mint/60 p-4 text-center">
          <p className="text-xs font-black text-emerald-800">周计划</p>
          <p className="mt-1 text-lg font-black text-emerald-900">{planTotal} 分钟/天</p>
        </button>
        <button onClick={onReview} className="rounded-2xl bg-violet-100 p-4 text-center">
          <p className="text-xs font-black text-violet-800">AI 复盘</p>
          <p className="mt-1 text-lg font-black text-violet-900">{data.recentReviews.length} 条</p>
        </button>
      </div>

      <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">本周计划 · 每天 {planTotal} 分钟</p>
            <h2 className="text-xl font-black">{data.currentPlan?.theme || '还没有配置本周计划'}</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={onBoards} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-800">板块</button>
            <button onClick={onStats} className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm">统计</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.currentPlanItems.length === 0 ? <p className="col-span-full text-sm text-slate-500">请先配置本周计划。</p> : data.currentPlanItems.map((item, index) => <BoardPlanCard key={item.id} item={item} index={index} />)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="本周累计" value={minutesToText(data.stats.weekMinutes)} tone="bg-sky-100" />
        <MetricCard label="完成率" value={`${data.stats.completionRate}%`} tone="bg-orange-100" />
        <MetricCard label="连续记录" value={`${data.stats.streakDays}天`} tone="bg-emerald-100" />
        <MetricCard label="今日记录" value={minutesToText(data.stats.todayMinutes)} tone="bg-yellow-100" />
      </section>

      <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-black">最近记录</h2>
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          <button onClick={() => onRecordFilter('all')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${recordFilter === 'all' ? 'bg-ink text-white' : 'bg-cream text-slate-600'}`}>全部</button>
          {activeBoards.map((board) => (
            <button key={board.id} onClick={() => onRecordFilter(board.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${recordFilter === board.id ? 'bg-ink text-white' : 'bg-cream text-slate-600'}`}>{board.name}</button>
          ))}
        </div>
        <RecordList records={filteredRecords} />
      </section>
    </div>
  );
}

// === GANTT VIEW ===
function GanttView({ data, onBack, onRefresh }: { data: ProjectData; onBack: () => void; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPhases, setEditPhases] = useState<ProjectPhase[]>(() => data.phases.map(p => ({ ...p })));
  const [saving, setSaving] = useState(false);

  async function regeneratePlan() {
    setGenerating(true);
    const response = await fetch('/api/project-detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: data.project.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setGenerating(false);
    if (!response.ok) { alert(payload.error || 'AI 生成计划失败。'); return; }
    await onRefresh();
  }

  async function savePhases() {
    setSaving(true);
    const response = await fetch('/api/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: data.project.id, phases: editPhases }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '保存阶段失败。'); return; }
    setEditMode(false);
    await onRefresh();
  }

  async function updatePhaseStatus(phaseId: number, status: string, progress: number) {
    const response = await fetch('/api/phases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: phaseId, status, progress }),
    });
    if (response.ok) await onRefresh();
  }

  const phases = data.phases;
  const projectStart = new Date(data.project.start_date);
  const projectEnd = new Date(data.project.end_date);
  const totalDays = Math.max(1, Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  return (
    <div className="space-y-5 pt-4">
      <div className="flex justify-between gap-3">
        <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>
        <div className="flex gap-2">
          <button onClick={() => { setEditMode(!editMode); setEditPhases(phases.map(p => ({ ...p }))); }} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-800">{editMode ? '取消编辑' : '编辑阶段'}</button>
          <button onClick={regeneratePlan} disabled={generating} className="rounded-full bg-violet-100 px-4 py-2 text-sm font-black text-violet-800 disabled:opacity-50">{generating ? 'AI 生成中...' : 'AI 重新生成'}</button>
        </div>
      </div>

      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">项目甘特图</p>
        <h1 className="mt-1 text-2xl font-black">{data.project.name}</h1>
        <p className="mt-1 text-sm font-bold text-slate-500">{data.project.start_date} → {data.project.end_date}（共 {totalDays} 天）</p>

        {phases.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-cream p-6 text-center">
            <p className="text-sm font-bold text-slate-600">还没有阶段计划</p>
            <p className="mt-2 text-xs font-bold text-slate-500">点击&ldquo;AI 重新生成&rdquo;或&ldquo;编辑阶段&rdquo;来创建</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {phases.map((phase) => {
              const phaseStart = new Date(phase.start_date);
              const phaseEnd = new Date(phase.end_date);
              const offsetDays = Math.max(0, Math.ceil((phaseStart.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)));
              const phaseDays = Math.max(1, Math.ceil((phaseEnd.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              const leftPercent = Math.min(100, (offsetDays / totalDays) * 100);
              const widthPercent = Math.max(5, Math.min(100 - leftPercent, (phaseDays / totalDays) * 100));

              const statusColors = { pending: 'bg-slate-200', in_progress: 'bg-sky-400', completed: 'bg-emerald-400' };
              const statusLabels = { pending: '未开始', in_progress: '进行中', completed: '已完成' };

              return (
                <div key={phase.id} className="rounded-2xl bg-cream/70 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black">{phase.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{phase.start_date} → {phase.end_date}（{phaseDays} 天）</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={phase.status}
                        onChange={(e) => updatePhaseStatus(phase.id, e.target.value, phase.progress)}
                        className={`rounded-full px-3 py-1 text-xs font-black text-white ${statusColors[phase.status]}`}
                      >
                        <option value="pending">未开始</option>
                        <option value="in_progress">进行中</option>
                        <option value="completed">已完成</option>
                      </select>
                    </div>
                  </div>
                  <div className="relative mt-3 h-6 rounded-full bg-slate-100">
                    <div
                      className={`absolute top-0 h-full rounded-full ${statusColors[phase.status]} transition-all`}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">进度</span>
                    <input
                      type="range" min={0} max={100} value={phase.progress}
                      onChange={(e) => updatePhaseStatus(phase.id, phase.status, Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs font-black">{phase.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {editMode ? (
          <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-orange-100">
            <p className="text-sm font-black">编辑阶段（保存后计划来源标记为&ldquo;手动修改&rdquo;）</p>
            <div className="mt-3 space-y-3">
              {editPhases.map((phase, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_7rem] gap-2">
                  <input value={phase.name} onChange={(e) => { const next = [...editPhases]; next[i].name = e.target.value; setEditPhases(next); }} className="rounded-xl border border-orange-100 bg-cream px-3 py-2 text-sm font-bold outline-none" />
                  <input type="date" value={phase.start_date} onChange={(e) => { const next = [...editPhases]; next[i].start_date = e.target.value; setEditPhases(next); }} className="rounded-xl border border-orange-100 bg-cream px-3 py-2 text-xs font-bold outline-none" />
                  <input type="date" value={phase.end_date} onChange={(e) => { const next = [...editPhases]; next[i].end_date = e.target.value; setEditPhases(next); }} className="rounded-xl border border-orange-100 bg-cream px-3 py-2 text-xs font-bold outline-none" />
                </div>
              ))}
            </div>
            <button onClick={savePhases} disabled={saving} className="mt-4 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '保存阶段修改'}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// === REVIEW VIEW ===
function ReviewView({ data, projectId, onBack, onRefresh }: { data: ProjectData; projectId: number; onBack: () => void; onRefresh: () => void }) {
  const [reviewType, setReviewType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [summary, setSummary] = useState('');
  const [insights, setInsights] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveReview(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) { alert('请填写复盘总结。'); return; }
    setSaving(true);
    const today = toDateKey(new Date());
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        review_type: reviewType,
        period_start: today,
        period_end: today,
        summary,
        insights: insights || null,
        next_steps: nextSteps || null,
        total_minutes: data.stats.weekMinutes,
        completion_rate: data.stats.completionRate,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '保存复盘失败。'); return; }
    setSummary(''); setInsights(''); setNextSteps('');
    await onRefresh();
  }

  return (
    <div className="space-y-5 pt-4">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>

      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">AI 复盘</p>
        <h1 className="mt-1 text-2xl font-black">记录你的反思与成长</h1>
        <p className="mt-2 rounded-2xl bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-700">
          当浪费时间去玩的快乐感小于对荒废时间的愧疚感后，你会增强自律性。完成任务的成就感又会督促你坚持下去。
        </p>

        <form onSubmit={saveReview} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">复盘类型</span>
            <select value={reviewType} onChange={(e) => setReviewType(e.target.value as 'daily' | 'weekly' | 'monthly')} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100">
              <option value="daily">每日复盘</option>
              <option value="weekly">每周复盘</option>
              <option value="monthly">每月复盘</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">这段时间做了什么？完成了什么？</span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="例如：完成了文献综述的结构调整，补充了两篇核心参考文献..." className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">有什么感悟或发现？（选填）</span>
            <textarea value={insights} onChange={(e) => setInsights(e.target.value)} rows={3} placeholder="例如：发现下午 3 点效率最高，晚上容易分心..." className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">下一步计划（选填）</span>
            <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} placeholder="例如：明天先把最难的部分解决..." className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
          </label>
          <button type="submit" disabled={saving} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '保存复盘'}</button>
        </form>
      </section>

      {data.recentReviews.length > 0 ? (
        <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
          <h2 className="text-lg font-black">历史复盘</h2>
          <div className="mt-4 space-y-3">
            {data.recentReviews.map((review) => (
              <div key={review.id} className="rounded-2xl bg-cream/70 p-4">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${review.review_type === 'daily' ? 'bg-sky-100 text-sky-800' : review.review_type === 'weekly' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                    {review.review_type === 'daily' ? '每日' : review.review_type === 'weekly' ? '每周' : '每月'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{review.period_start}</span>
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{review.summary}</p>
                {review.insights ? <p className="mt-2 text-xs font-bold leading-5 text-violet-600">💡 {review.insights}</p> : null}
                {review.next_steps ? <p className="mt-1 text-xs font-bold leading-5 text-sky-600">→ {review.next_steps}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// === REUSABLE COMPONENTS ===
function BoardPlanCard({ item, index }: { item: WeeklyPlanItem; index: number }) {
  const board = item.task_board;
  return (
    <div className={`rounded-[1.4rem] p-4 ring-1 ${boardColors[index % boardColors.length]}`}>
      <p className="text-sm font-black">{board?.name || '任务板块'}</p>
      <p className="mt-2 text-2xl font-black">{item.daily_minutes}</p>
      <p className="text-xs opacity-75">分钟 / 天</p>
      <p className="mt-3 line-clamp-2 text-xs opacity-75">{board?.kind === 'long_term' ? '长期' : '临时'} · {board?.goal || '未设目标'}</p>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`rounded-[1.6rem] ${tone} p-4`}><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function FocusView({ boards, session, board, elapsedSeconds, paused, onPause, onFinish, onChangeBoard }: {
  boards: TaskBoard[]; session: RunningSession; board: TaskBoard | null | undefined;
  elapsedSeconds: number; paused: boolean; onPause: () => void; onFinish: () => void; onChangeBoard: (id: number) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col justify-center space-y-8">
      <div className="text-center">
        <p className="text-sm font-black text-orange-700">正在感知这一段时间</p>
        <h1 className="mt-4 text-7xl font-black tracking-tight sm:text-8xl">{formatSeconds(elapsedSeconds)}</h1>
        <p className="mt-4 text-sm font-bold text-slate-500">时间正在流逝，请把它交给真正重要的事</p>
      </div>
      <div className="rounded-[2rem] bg-white/85 p-5 text-center shadow-soft">
        <p className="text-sm font-bold text-slate-500">当前任务板块：{board?.name || '未选择'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {boards.map((item) => (
            <button key={item.id} onClick={() => onChangeBoard(item.id)} className={`rounded-2xl px-3 py-3 text-sm font-black ${item.id === session.taskBoardId ? 'bg-honey text-orange-900 ring-2 ring-orange-200' : 'bg-slate-50 text-slate-500'}`}>{item.name}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onPause} className="rounded-[1.5rem] bg-white px-6 py-5 text-lg font-black shadow-soft">{paused ? '继续' : '暂停'}</button>
        <button onClick={onFinish} className="rounded-[1.5rem] bg-ink px-6 py-5 text-lg font-black text-white shadow-soft">结束并记录</button>
      </div>
    </div>
  );
}

function FinishView({ board, elapsedSeconds, content, saving, onContent, onBack, onSave }: {
  board: TaskBoard | null | undefined; elapsedSeconds: number; content: string; saving: boolean;
  onContent: (v: string) => void; onBack: () => void; onSave: () => void;
}) {
  return (
    <div className="space-y-5 pt-8">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回计时</button>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">这一段时间过去了</p>
        <h1 className="mt-2 text-3xl font-black">{board?.name || '任务'} · {minutesToText(Math.round(elapsedSeconds / 60))}</h1>
        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-black text-slate-700">记录这段时间你真正做了什么 *</span>
          <textarea value={content} onChange={(e) => onContent(e.target.value)} rows={5} placeholder="例如：修改论文第三章 / 完成考公课程第五讲 / 浏览20个秋招岗位" className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
        </label>
        <p className="mt-3 text-xs font-bold leading-6 text-slate-500">时间长短不是目的。请诚实记录这段时间被交给了什么。</p>
        <button onClick={onSave} disabled={saving || !content.trim()} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '保存记录'}</button>
      </section>
    </div>
  );
}

function PlanView({ data, projectId, onBack, onBoards, onSaved }: { data: ProjectData; projectId: number; onBack: () => void; onBoards: () => void; onSaved: () => void }) {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const initialItems = new Map(data.currentPlanItems.map((item) => [item.task_board_id, item.daily_minutes]));
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>(() => data.currentPlanItems.map((item) => item.task_board_id));
  const [minutesByBoard, setMinutesByBoard] = useState<Record<number, number>>(() => {
    const result: Record<number, number> = {};
    data.taskBoards.forEach((board) => { result[board.id] = initialItems.get(board.id) || 0; });
    return result;
  });
  const [saving, setSaving] = useState(false);
  const selectedBoards = data.taskBoards.filter((board) => selectedBoardIds.includes(board.id));
  const selectedCount = selectedBoardIds.length;
  const total = selectedBoardIds.reduce((acc, boardId) => acc + Number(minutesByBoard[boardId] || 0), 0);
  const targetMinutes = getMinutesBetween(data.project.daily_start_time || '19:30', data.project.daily_end_time || '23:30');
  const remainingMinutes = targetMinutes - total;
  const generatedTheme = selectedBoards.length ? `${selectedBoards.map((board) => board.name).join(' / ')}推进周` : '时间感知周';

  function toggleBoard(boardId: number) {
    if (selectedBoardIds.includes(boardId)) { setSelectedBoardIds(selectedBoardIds.filter((id) => id !== boardId)); return; }
    setSelectedBoardIds([...selectedBoardIds, boardId]);
  }

  async function save() {
    if (selectedCount < 1) { alert('每周计划至少选择 1 个任务板块。'); return; }
    if (selectedBoardIds.some((boardId) => Number(minutesByBoard[boardId] || 0) <= 0)) { alert('请为已选择的每个任务板块配置每天时间。'); return; }
    if (total !== targetMinutes) { alert(`所有板块每天时间之和必须等于项目每日固定时间 ${targetMinutes} 分钟。当前合计 ${total} 分钟，还${remainingMinutes > 0 ? `差 ${remainingMinutes}` : `多 ${Math.abs(remainingMinutes)}`} 分钟。`); return; }
    setSaving(true);
    const response = await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, theme: generatedTheme, week_start_date: toDateKey(weekStart), week_end_date: toDateKey(weekEnd), items: selectedBoardIds.map((task_board_id) => ({ task_board_id, daily_minutes: minutesByBoard[task_board_id] || 0 })) }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '保存周计划失败。'); return; }
    onSaved();
  }

  return (
    <div className="space-y-5 pt-4">
      <div className="flex justify-between gap-3">
        <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>
        <button onClick={onBoards} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-800">管理自定义板块</button>
      </div>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">本周计划</p>
        <h1 className="mt-1 text-2xl font-black">{formatChineseDate(weekStart)}—{formatChineseDate(weekEnd)}</h1>
        <p className="mt-3 rounded-2xl bg-cream p-4 text-sm font-bold leading-6 text-slate-600">先从自定义板块中选择本周要执行的内容，再配置每天时间；所有已选板块每天时间之和必须等于项目每日固定时间。</p>
        <p className="mt-4 text-sm font-black text-slate-700">自动生成主题：{generatedTheme}</p>
        <p className="mt-2 text-sm font-bold text-slate-500">项目每日固定时间：{data.project.daily_start_time || '19:30'}—{data.project.daily_end_time || '23:30'}，共 {targetMinutes} 分钟</p>

        {data.taskBoards.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-white p-5 text-sm font-bold leading-6 text-slate-600 ring-1 ring-orange-100">还没有自定义板块。请先点击&ldquo;管理自定义板块&rdquo;创建板块。</div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.taskBoards.map((board) => {
              const selected = selectedBoardIds.includes(board.id);
              return (
                <button key={board.id} onClick={() => toggleBoard(board.id)} className={`rounded-2xl p-4 text-left ring-1 transition ${selected ? 'bg-honey text-orange-900 ring-orange-200' : 'bg-cream/70 text-slate-600 ring-orange-100'}`}>
                  <p className="font-black">{board.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-bold opacity-75">{board.kind === 'long_term' ? '长期' : '临时'} · {board.goal || '未设目标'}</p>
                </button>
              );
            })}
          </div>
        )}

        {selectedBoards.length > 0 ? (
          <div className="mt-5 space-y-3">
            {selectedBoards.map((board) => (
              <div key={board.id} className="rounded-2xl bg-white p-4 ring-1 ring-orange-100">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="font-black">{board.name}</p><p className="mt-1 text-xs font-bold text-slate-500">每天配置时间</p></div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={5} step={5} value={minutesByBoard[board.id] || ''} onChange={(e) => setMinutesByBoard({ ...minutesByBoard, [board.id]: Number(e.target.value) })} className="w-24 rounded-xl border border-orange-100 bg-cream px-3 py-2 text-right font-black outline-none" />
                    <span className="text-sm font-bold text-slate-500">分钟</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <p className={`mt-4 rounded-2xl p-4 text-sm font-bold ${remainingMinutes === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-600'}`}>
          已选择 {selectedCount} 个板块，每天合计 {total} 分钟；目标合计 {targetMinutes} 分钟，{remainingMinutes === 0 ? '时间已匹配。' : remainingMinutes > 0 ? `还差 ${remainingMinutes} 分钟。` : `已超出 ${Math.abs(remainingMinutes)} 分钟。`}
        </p>
        <button onClick={save} disabled={saving || data.taskBoards.length === 0} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '保存本周计划'}</button>
      </section>
    </div>
  );
}

function BoardsView({ boards, projectId, onBack, onSaved }: { boards: TaskBoard[]; projectId: number; onBack: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TaskKind>('temporary');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const [editing, setEditing] = useState<Record<number, { kind: TaskKind; goal: string }>>(() => {
    const result: Record<number, { kind: TaskKind; goal: string }> = {};
    boards.forEach((board) => { result[board.id] = { kind: board.kind, goal: board.goal || '' }; });
    return result;
  });

  async function createBoard() {
    if (!name.trim()) { alert('请填写任务板块名称。'); return; }
    if (kind === 'long_term' && !goal.trim()) { alert('长期任务必须设定目标。'); return; }
    setSaving(true);
    const response = await fetch('/api/task-boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, name, kind, goal }) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '创建任务板块失败。'); return; }
    setName(''); setKind('temporary'); setGoal('');
    await onSaved();
  }

  async function updateBoard(board: TaskBoard) {
    const draft = editing[board.id] || { kind: board.kind, goal: board.goal || '' };
    if (draft.kind === 'long_term' && !draft.goal.trim()) { alert('长期任务必须设定目标。'); return; }
    setSaving(true);
    const response = await fetch('/api/task-boards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: board.id, kind: draft.kind, goal: draft.goal }) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '更新任务板块失败。'); return; }
    await onSaved();
  }

  async function deleteBoard(board: TaskBoard) {
    if (!window.confirm(`确定删除板块"${board.name}"吗？`)) return;
    setSaving(true);
    const response = await fetch('/api/task-boards', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: board.id }) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '删除任务板块失败。'); return; }
    await onSaved();
  }

  function startLongPress(board: TaskBoard) {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => { deleteBoard(board); longPressTimer.current = null; }, 2000);
  }
  function cancelLongPress() {
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div className="space-y-5 pt-4">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">自定义板块</p>
        <h1 className="mt-1 text-2xl font-black">创建自己的任务板块</h1>
        <p className="mt-3 rounded-2xl bg-cream p-4 text-sm font-bold leading-6 text-slate-600">长按已创建板块 2 秒可选择删除。</p>
        <div className="mt-5 grid gap-3">
          {boards.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 ring-1 ring-orange-100">还没有板块。请先在下方创建。</p>
          ) : boards.map((board) => {
            const draft = editing[board.id] || { kind: board.kind, goal: board.goal || '' };
            return (
              <div key={board.id} onMouseDown={() => startLongPress(board)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress} onTouchStart={() => startLongPress(board)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} className="rounded-2xl bg-cream/70 p-4 select-none">
                <div className="flex items-start justify-between gap-3"><div><p className="font-black">{board.name}</p><p className="mt-1 text-xs font-bold text-slate-500">长按 2 秒删除</p></div></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_1fr_auto]">
                  <select value={draft.kind} onChange={(e) => setEditing({ ...editing, [board.id]: { ...draft, kind: e.target.value as TaskKind } })} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-bold outline-none"><option value="temporary">临时任务</option><option value="long_term">长期任务</option></select>
                  <input value={draft.goal} onChange={(e) => setEditing({ ...editing, [board.id]: { ...draft, goal: e.target.value } })} placeholder={draft.kind === 'long_term' ? '长期目标（必填）' : '目标（选填）'} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-bold outline-none" />
                  <button onClick={() => updateBoard(board)} disabled={saving} className="rounded-xl bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-50">保存</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <h2 className="text-xl font-black">新增自定义板块</h2>
        <div className="mt-4 space-y-4">
          <Field label="板块名称" value={name} onChange={setName} />
          <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">任务类型</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"><option value="temporary">临时任务：可选择是否设定目标</option><option value="long_term">长期任务：必须设定目标</option></select>
          </label>
          <Field label={kind === 'long_term' ? '目标（必填）' : '目标（选填）'} value={goal} onChange={setGoal} />
          <button onClick={createBoard} disabled={saving} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '创建任务板块'}</button>
        </div>
      </section>
    </div>
  );
}

function StatsView({ data, onBack }: { data: ProjectData; onBack: () => void }) {
  const stats = data.stats;
  return (
    <div className="space-y-5 pt-4">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">时间统计</p>
        <h1 className="mt-1 text-2xl font-black">坚持不是打卡，是每天靠近目标</h1>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MetricCard label="今天" value={minutesToText(stats.todayMinutes)} tone="bg-yellow-100" />
          <MetricCard label="本周" value={minutesToText(stats.weekMinutes)} tone="bg-sky-100" />
          <MetricCard label="本月" value={minutesToText(stats.monthMinutes)} tone="bg-emerald-100" />
          <MetricCard label="累计" value={minutesToText(stats.totalMinutes)} tone="bg-orange-100" />
        </div>
        <div className="mt-6 space-y-3">
          {data.currentPlanItems.map((item) => {
            const minutes = stats.byBoardThisWeek[item.task_board_id] || 0;
            const percent = stats.weekMinutes ? Math.round((minutes / stats.weekMinutes) * 100) : 0;
            return <div key={item.id}><div className="mb-1 flex justify-between text-sm font-bold"><span>{item.task_board?.name}</span><span>{minutesToText(minutes)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-300 to-sky-300" style={{ width: `${percent}%` }} /></div></div>;
          })}
        </div>
      </section>
      <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
        <h2 className="text-lg font-black">最近记录</h2>
        <div className="mt-3"><RecordList records={data.recentSessions} /></div>
      </section>
    </div>
  );
}

function RecordList({ records }: { records: StudySession[] }) {
  if (records.length === 0) return <p className="text-sm text-slate-500">还没有记录。开始第一段 MyTime。</p>;
  return <div className="space-y-3">{records.map((item) => <div key={item.id} className="rounded-2xl bg-cream/70 p-4"><p className="text-sm font-black">{item.study_date} · {item.task_board?.name || '任务'} · {minutesToText(item.duration_minutes)}</p><p className="mt-1 text-sm text-slate-600">{item.content}</p></div>)}</div>;
}

function Field({ label, value, onChange, type = 'text', multiline = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-3 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-3 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
      )}
    </label>
  );
}

function getStudyStatus(now: Date, startTime: string, endTime: string) {
  const start = timeToToday(startTime, now);
  const end = timeToToday(endTime, now);
  if (now < start) return { label: '等待开始', prefix: '距离开始还有', text: minutesToText(Math.ceil((start.getTime() - now.getTime()) / 60000)) };
  if (now <= end) return { label: '项目时间', prefix: '这段固定时间已经流逝', text: minutesToText(Math.floor((now.getTime() - start.getTime()) / 60000)) };
  return { label: '今日结束', prefix: '今天的固定时间已结束', text: '明天继续靠近目标' };
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
