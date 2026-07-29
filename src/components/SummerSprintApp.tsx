/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import type { Space, SpaceMood, ProjectSummary, Project, ProjectPhase, TaskBoard, TaskKind, WeeklyPlan, WeeklyPlanItem, StudySession, Review, Difficulty, ProjectStatus, ProjectType, SessionOutcome } from '@/types';
import { formatChineseDate, getWeekEnd, getWeekStart, minutesToText, toDateKey } from '@/lib/date';
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

type View = 'space' | 'project';
type ProjectMode = 'home' | 'gantt' | 'focus' | 'finish' | 'plan' | 'stats' | 'boards' | 'review';

type RunningSession = { taskBoardId: number | null; phaseId: number | null; startAt: string; pausedMs: number };

type SpaceData = { space: Space; projects: ProjectSummary[]; projectPhases: ProjectPhase[]; moods: SpaceMood[] };

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

type CreationPhase = Pick<ProjectPhase, 'name' | 'start_date' | 'end_date'>;
type CreationPreview = {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  difficulty: Difficulty;
  initialStatus: Extract<ProjectStatus, 'active' | 'paused'>;
  classification: { projectType: ProjectType; projectSubtype: string | null };
  phases: CreationPhase[];
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
  const [outcomeStatus, setOutcomeStatus] = useState<SessionOutcome>('progressed');
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

  async function loadProject(projectId: number, startImmediately = false) {
    setLoading(true); setError('');
    const response = await fetch(`/api/project-detail?projectId=${projectId}`);
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '读取项目数据失败。'); return; }
    setProjectData(payload);
    setSelectedProjectId(projectId);
    setView('project');
    if (startImmediately) {
      const today = toDateKey(new Date());
      const currentPhase = payload.phases.find((phase: ProjectPhase) => phase.status === 'in_progress')
        || payload.phases.find((phase: ProjectPhase) => phase.start_date <= today && phase.end_date >= today)
        || payload.phases.find((phase: ProjectPhase) => phase.status === 'pending')
        || null;
      const planBoards = (payload.currentPlanItems || []).map((item: WeeklyPlanItem) => item.task_board).filter(Boolean) as TaskBoard[];
      const focusBoardId = planBoards[0]?.id || payload.taskBoards[0]?.id || null;
      setSession({ taskBoardId: focusBoardId, phaseId: currentPhase?.id || null, startAt: new Date().toISOString(), pausedMs: 0 });
      setPaused(false); setPauseStartedAt(null); setContent(''); setOutcomeStatus('progressed'); setMode('focus');
    } else {
      setMode('home');
    }
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
  const suggestedBoardId = activeBoards[0]?.id || fallbackBoard?.id || null;

  const elapsedSeconds = useMemo(() => {
    if (!session) return 0;
    const start = new Date(session.startAt).getTime();
    const runningUntil = paused && pauseStartedAt ? pauseStartedAt : now.getTime();
    return Math.max(0, Math.floor((runningUntil - start - session.pausedMs) / 1000));
  }, [session, now, paused, pauseStartedAt]);

  function startFocus(taskBoardId = suggestedBoardId) {
    const today = toDateKey(new Date());
    const currentPhase = projectData?.phases.find((phase) => phase.status === 'in_progress')
      || projectData?.phases.find((phase) => phase.start_date <= today && phase.end_date >= today)
      || projectData?.phases.find((phase) => phase.status === 'pending')
      || null;
    setSession({ taskBoardId, phaseId: currentPhase?.id || null, startAt: new Date().toISOString(), pausedMs: 0 });
    setPaused(false); setPauseStartedAt(null); setContent(''); setOutcomeStatus('progressed'); setMode('focus');
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
        phase_id: session.phaseId,
        outcome_status: outcomeStatus,
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
          projectPhases={spaceData.projectPhases}
          moods={spaceData.moods}
          onOpenProject={(id) => loadProject(id)}
          onStartProject={(id) => loadProject(id, true)}
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
            now={now} data={projectData}
            onStart={() => startFocus()} onPlan={() => setMode('plan')} onStats={() => setMode('stats')}
            onBoards={() => setMode('boards')} onGantt={() => setMode('gantt')} onReview={() => setMode('review')}
            onBack={() => { setView('space'); setProjectData(null); setSelectedProjectId(null); void loadSpace(); }}
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
          <FinishView board={sessionBoard} elapsedSeconds={elapsedSeconds} content={content} outcome={outcomeStatus} saving={saving}
            onContent={setContent} onOutcome={setOutcomeStatus} onBack={() => setMode('focus')} onSave={saveSession} />
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
function SpaceView({ space, projects, projectPhases, moods, onOpenProject, onStartProject, onRefresh, onLogout }: {
  space: Space; projects: ProjectSummary[]; projectPhases: ProjectPhase[]; moods: SpaceMood[]; onOpenProject: (id: number) => void; onStartProject: (id: number) => Promise<void>; onRefresh: () => void; onLogout: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(toDateKey(new Date()));
  const [endDate, setEndDate] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [initialStatus, setInitialStatus] = useState<Extract<ProjectStatus, 'active' | 'paused'>>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [creationPreview, setCreationPreview] = useState<CreationPreview | null>(null);
  const [moodRecords, setMoodRecords] = useState(moods);
  const [moodSaving, setMoodSaving] = useState('');
  const [moodError, setMoodError] = useState('');
  const [moodPage, setMoodPage] = useState(0);
  const [turningMoodHandle, setTurningMoodHandle] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
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
      body: JSON.stringify({ name, goal, start_date: startDate, end_date: endDate, difficulty, initial_status: initialStatus, preview: true }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(payload.error || '生成项目计划失败。'); return; }
    setShowCreate(false);
    setCreationPreview({
      name,
      goal,
      startDate,
      endDate,
      difficulty,
      initialStatus,
      classification: payload.classification,
      phases: payload.phases || [],
    });
  }

  async function confirmCreation() {
    if (!creationPreview) return;
    if (!creationPreview.phases.length || creationPreview.phases.some((phase) => !phase.name.trim() || !phase.start_date || !phase.end_date || phase.start_date > phase.end_date)) {
      setError('请保留至少一个名称和日期完整的阶段。');
      return;
    }
    setSaving(true); setError('');
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: creationPreview.name,
        goal: creationPreview.goal,
        start_date: creationPreview.startDate,
        end_date: creationPreview.endDate,
        difficulty: creationPreview.difficulty,
        initial_status: creationPreview.initialStatus,
        auto_project_type: creationPreview.classification.projectType,
        auto_project_subtype: creationPreview.classification.projectSubtype,
        phase_overrides: creationPreview.phases,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(payload.error || '保存项目计划失败。'); return; }
    setName(''); setGoal(''); setEndDate(''); setInitialStatus('active');
    setCreationPreview(null);
    await onStartProject(payload.id);
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

  if (creationPreview) {
    return (
      <CreationPlanView
        preview={creationPreview}
        saving={saving}
        error={error}
        onChange={(phases) => setCreationPreview({ ...creationPreview, phases })}
        onBack={() => { setError(''); setCreationPreview(null); setShowCreate(true); }}
        onConfirm={confirmCreation}
      />
    );
  }

  return (
    <div className="rounded-[2.5rem] bg-[#fff7ea] p-5 shadow-soft sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <div title={space.name}>
          <p className="text-sm font-black text-orange-700">MyTime</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">我的空间</h1>
        </div>
        <button onClick={onLogout} className="shrink-0 rounded-full bg-white px-4 py-2.5 text-xs font-black text-slate-500 shadow-sm">退出空间</button>
      </header>

      <section className="mt-6 rounded-[2rem] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="w-full text-lg font-black text-slate-500">今天状态怎么样呀~</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cream text-slate-500 transition hover:-translate-y-0.5"
              aria-label="打开状态日历"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" strokeLinecap="round" />
              </svg>
            </button>
            {todayMood ? (
              <div className="flex items-center gap-2 rounded-2xl bg-cream/70 py-1.5 pl-1.5 pr-3">
                <img src={getMoodByKey(todayMood.mood_key)?.src} alt={getMoodByKey(todayMood.mood_key)?.label || '今日状态'} className="h-12 w-12 rounded-xl object-cover" />
                <span className="whitespace-nowrap text-sm font-black text-slate-600">{getMoodByKey(todayMood.mood_key)?.label}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded-[1.6rem] border border-orange-100 bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 p-3">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-2">
              {visibleMoods.map((mood) => {
                const selected = todayMood?.mood_key === mood.key;
                return (
                  <button
                    key={mood.key}
                    type="button"
                    onClick={() => saveMood(mood.key)}
                    disabled={Boolean(moodSaving) || turningMoodHandle}
                    className={`overflow-hidden rounded-2xl p-0.5 transition disabled:opacity-50 ${selected ? 'bg-honey ring-2 ring-orange-300' : 'bg-cream/70 ring-1 ring-orange-100 hover:-translate-y-0.5'}`}
                    aria-label={mood.label}
                  >
                    <img src={mood.src} alt="" className="aspect-square w-full scale-125 rounded-xl object-cover" />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={turnMoodHandle}
              disabled={turningMoodHandle || Boolean(moodSaving)}
              className="relative flex h-14 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffe0d3] shadow-inner transition active:scale-95 disabled:opacity-60"
              aria-label="转动扭蛋机把手，换一批表情"
            >
              <span className={`absolute bottom-3 h-9 w-1.5 origin-bottom rounded-full bg-orange-300 transition-transform duration-300 ${turningMoodHandle ? 'rotate-[-38deg]' : 'rotate-[28deg]'}`}>
                <span className="absolute -left-1.5 -top-2 h-4 w-4 rounded-full bg-coral ring-2 ring-white" />
              </span>
            </button>
          </div>
        </div>
        {moodError ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{moodError}</p> : null}
      </section>

      {calendarOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/20 p-5 backdrop-blur-[2px]" onClick={() => setCalendarOpen(false)}>
          <div className="relative w-full max-w-md" role="dialog" aria-modal="true" aria-label="状态日历" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setCalendarOpen(false)} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-cream text-xl font-bold text-slate-500" aria-label="关闭日历">×</button>
            <MoodCalendar moods={moodRecords} />
          </div>
        </div>
      ) : null}

      {projects.length > 0 ? <SpaceGanttOverview projects={projects} phases={projectPhases} onOpenProject={onOpenProject} /> : null}

      <button onClick={() => setShowCreate(!showCreate)} className="mt-6 w-full rounded-[1.6rem] bg-ink px-6 py-4 text-base font-black text-white shadow-lg transition active:scale-[0.99]">{showCreate ? '取消创建' : '＋ 创建新项目'}</button>

      {showCreate ? (
        <section className="mt-5 rounded-[2rem] bg-white/90 p-6 shadow-soft">
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
          <form onSubmit={createProject} className="space-y-4">
            <Field label="项目名称" value={name} onChange={setName} />
            <Field label="项目目标" value={goal} onChange={setGoal} multiline />
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始日期" type="date" value={startDate} onChange={setStartDate} />
              <Field label="截止日期" type="date" value={endDate} onChange={setEndDate} />
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">项目初始状态</span>
              <select value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as Extract<ProjectStatus, 'active' | 'paused'>)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100">
                <option value="active">进行中</option>
                <option value="paused">暂缓</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">任务难度</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100">
                <option value="easy">简单：3 个阶段</option>
                <option value="medium">中等：4 个阶段</option>
                <option value="hard">困难：5 个阶段</option>
              </select>
            </label>
            <button type="submit" disabled={saving} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在创建...' : '创建项目'}</button>
          </form>
        </section>
      ) : null}

      {projects.length > 0 ? <section className="mt-7 space-y-4">
        {projects.map((project) => (
          <SwipeProjectCard
            key={project.id}
            project={project}
            deleting={deletingProjectId === project.id}
            onOpen={() => onOpenProject(project.id)}
            onDelete={() => deleteProject(project)}
          />
        ))}
      </section> : null}
    </div>
  );
}

function CreationPlanView({ preview, saving, error, onChange, onBack, onConfirm }: {
  preview: CreationPreview; saving: boolean; error: string; onChange: (phases: CreationPhase[]) => void; onBack: () => void; onConfirm: () => void;
}) {
  function updatePhase(index: number, field: keyof CreationPhase, value: string) {
    const phases = preview.phases.map((phase, phaseIndex) => phaseIndex === index ? { ...phase, [field]: value } : phase);
    onChange(phases);
  }

  function addPhase() {
    onChange([...preview.phases, { name: '新增阶段', start_date: preview.startDate, end_date: preview.endDate }]);
  }

  function removePhase(index: number) {
    if (preview.phases.length <= 1) return;
    onChange(preview.phases.filter((_, phaseIndex) => phaseIndex !== index));
  }

  return (
    <div className="space-y-5 pt-3">
      <button type="button" onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回修改信息</button>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-orange-700">AI 项目计划</p>
        <h1 className="mt-1 text-2xl font-black">{preview.name}</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{preview.goal}</p>
        <div className="mt-5 space-y-3">
          {preview.phases.map((phase, index) => (
            <div key={`${index}-${phase.name}`} className="rounded-2xl bg-cream/70 p-4 ring-1 ring-orange-100">
              <div className="flex items-center gap-2">
                <input value={phase.name} onChange={(event) => updatePhase(index, 'name', event.target.value)} className="min-w-0 flex-1 rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-black outline-none" aria-label={`第 ${index + 1} 阶段名称`} />
                {preview.phases.length > 1 ? <button type="button" onClick={() => removePhase(index)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-400">×</button> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input type="date" value={phase.start_date} onChange={(event) => updatePhase(index, 'start_date', event.target.value)} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-xs font-bold outline-none" aria-label={`第 ${index + 1} 阶段开始日期`} />
                <input type="date" value={phase.end_date} onChange={(event) => updatePhase(index, 'end_date', event.target.value)} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-xs font-bold outline-none" aria-label={`第 ${index + 1} 阶段结束日期`} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addPhase} className="mt-4 w-full rounded-2xl bg-cream px-4 py-3 text-sm font-black text-slate-600">＋ 添加阶段</button>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
        <button type="button" onClick={onConfirm} disabled={saving} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存…' : '确认并开始专注'}</button>
      </section>
    </div>
  );
}

function SpaceGanttOverview({ projects, phases, onOpenProject }: { projects: ProjectSummary[]; phases: ProjectPhase[]; onOpenProject: (id: number) => void }) {
  const timelineProjects = projects.filter((project) => project.start_date && project.end_date);
  const starts = timelineProjects.map((project) => project.start_date).sort();
  const ends = timelineProjects.map((project) => project.end_date).sort();
  const rangeStart = starts[0];
  const rangeEnd = ends[ends.length - 1];
  if (!rangeStart || !rangeEnd) return null;

  const rangeDays = Math.max(1, Math.round((new Date(`${rangeEnd}T00:00:00`).getTime() - new Date(`${rangeStart}T00:00:00`).getTime()) / 86400000));
  const today = toDateKey(new Date());
  const todayPosition = Math.min(100, Math.max(0, ((new Date(`${today}T00:00:00`).getTime() - new Date(`${rangeStart}T00:00:00`).getTime()) / 86400000 / rangeDays) * 100));
  const colors = ['bg-orange-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400', 'bg-rose-400'];

  function position(date: string) {
    return Math.min(100, Math.max(0, ((new Date(`${date}T00:00:00`).getTime() - new Date(`${rangeStart}T00:00:00`).getTime()) / 86400000 / rangeDays) * 100));
  }

  function width(start: string, end: string) {
    return Math.max(2, Math.min(100 - position(start), ((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000 / rangeDays) * 100));
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white/90 p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-bold text-slate-500">项目时间线</p><h2 className="text-xl font-black">我的项目甘特图</h2></div>
        <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-black text-slate-500">{timelineProjects.length} 项目</span>
      </div>
      <div className="mt-5 flex justify-between text-[11px] font-bold text-slate-400"><span>{rangeStart}</span><span>{rangeEnd}</span></div>
      <div className="mt-2 space-y-4">
        {timelineProjects.map((project, projectIndex) => {
          const projectPhaseList = phases.filter((phase) => phase.project_id === project.id);
          const currentPhase = projectPhaseList.find((phase) => phase.status === 'in_progress') || projectPhaseList.find((phase) => phase.status === 'pending');
          const completed = projectPhaseList.filter((phase) => phase.status === 'completed').length;
          const progress = projectPhaseList.length ? Math.round(((completed + ((currentPhase?.progress || 0) / 100)) / projectPhaseList.length) * 100) : 0;
          return (
            <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="w-full text-left">
              <div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-black text-slate-700">{project.name}</span><span className="shrink-0 text-xs font-bold text-slate-500">{progress}%</span></div>
              <div className="relative h-8 overflow-hidden rounded-xl bg-slate-100">
                <span className="absolute inset-y-0 z-10 w-px bg-ink/40" style={{ left: `${todayPosition}%` }} aria-hidden="true" />
                {projectPhaseList.length ? projectPhaseList.map((phase, phaseIndex) => (
                  <span key={phase.id} title={phase.name} className={`absolute top-1 h-6 rounded-lg ${phase.status === 'completed' ? 'bg-emerald-400' : phase.status === 'in_progress' ? 'bg-orange-400' : colors[(projectIndex + phaseIndex) % colors.length]} ${phase.status === 'pending' ? 'opacity-60' : ''}`} style={{ left: `${position(phase.start_date)}%`, width: `${width(phase.start_date, phase.end_date)}%` }} />
                )) : <span className={`absolute top-1 h-6 rounded-lg ${colors[projectIndex % colors.length]}`} style={{ left: `${position(project.start_date)}%`, width: `${width(project.start_date, project.end_date)}%` }} />}
              </div>
              <p className="mt-1.5 truncate text-xs font-bold text-slate-500">{currentPhase?.name || (project.status === 'completed' ? '已完成' : project.status === 'paused' ? '暂缓' : '未设置阶段')}</p>
            </button>
          );
        })}
      </div>
    </section>
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
    <section className="rounded-[2rem] bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{year} 年 {monthIndex + 1} 月</h2>
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
          <p className="truncate text-xl font-black">{project.name}</p>
          <p className="mt-1.5 text-xs font-bold text-slate-500">{project.start_date} → {project.end_date}</p>
        </div>
        <span className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${statusClass}`}>{statusText}</span>
      </button>
    </div>
  );
}

// === PROJECT HOME VIEW ===
function ProjectHomeView({ now, data, onStart, onPlan, onStats, onBoards, onGantt, onReview, onBack, recordFilter, onRecordFilter }: {
  now: Date; data: ProjectData;
  onStart: () => void; onPlan: () => void; onStats: () => void; onBoards: () => void;
  onGantt: () => void; onReview: () => void; onBack: () => void;
  recordFilter: number | 'all'; onRecordFilter: (v: number | 'all') => void;
}) {
  const currentPhase = data.phases.find((phase) => phase.status === 'in_progress')
    || data.phases.find((phase) => phase.start_date <= toDateKey(now) && phase.end_date >= toDateKey(now))
    || data.phases.find((phase) => phase.status === 'pending')
    || data.phases.at(-1);
  const activeBoards = data.currentPlanItems.map((item) => item.task_board).filter(Boolean) as TaskBoard[];
  const recentRecords = data.recentSessions;
  const filteredRecords = recordFilter === 'all' ? recentRecords : recentRecords.filter((item) => item.task_board_id === recordFilter);
  const weekExpected = data.currentPlanItems.reduce((sum, item) => sum + Number(item.expected_minutes ?? (item.daily_minutes * 7)), 0);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-bold text-orange-700">MyTime</p>
          <h1 className="text-2xl font-black tracking-tight">{data.project.name}</h1>
        </div>
        <button onClick={onBack} className="rounded-full bg-white/70 px-4 py-2 text-xs font-bold text-slate-500 shadow-sm">返回空间</button>
      </header>

      <section className="rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-500">项目目标</p>
            <h2 className="mt-2 text-base font-black leading-7 text-slate-700">{data.project.goal || data.project.total_goal}</h2>
          </div>
        </div>
        <div className="mt-5 rounded-[1.6rem] bg-cream p-5">
          <p className="text-sm font-bold text-slate-500">当前阶段</p>
          <p className="mt-1 text-xl font-black text-slate-800">{currentPhase?.name || '先建立项目路线图'}</p>
          <p className="mt-2 text-xs font-bold text-slate-500">{currentPhase ? `${currentPhase.start_date} — ${currentPhase.end_date} · ${currentPhase.progress}%` : '路线图会帮助你确认先后顺序。'}</p>
        </div>
        <button onClick={onStart} className="mt-5 w-full rounded-[1.7rem] bg-gradient-to-r from-orange-400 to-amber-300 px-6 py-5 text-lg font-black text-white shadow-lg shadow-orange-100 active:scale-[0.99]">
          开始专注
        </button>
      </section>

      <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-500">本周推进</p>
            <h2 className="text-xl font-black">{data.currentPlan?.theme || '还未选择本周行动'}</h2>
          </div>
          <button onClick={onPlan} className="rounded-full bg-mint/70 px-4 py-2 text-sm font-black text-emerald-800">调整</button>
        </div>
        {data.currentPlanItems.length ? (
          <div className="mt-4 space-y-2">
            {data.currentPlanItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-cream/70 px-4 py-3">
                <span className="text-sm font-black text-slate-700">{item.task_board?.name || '未命名行动'}</span>
                {Number(item.expected_minutes ?? 0) > 0 ? <span className="text-xs font-bold text-slate-500">预计 {minutesToText(Number(item.expected_minutes))}</span> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm font-bold text-slate-500">只保留 1—3 件本周最重要的推进事项。</p>}
        {weekExpected > 0 ? <p className="mt-3 text-xs font-bold text-slate-500">本周预计投入 {minutesToText(weekExpected)}</p> : null}
      </section>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onGantt} className="rounded-2xl bg-sky-100 p-4 text-center"><p className="text-xs font-black text-sky-800">路线图</p><p className="mt-1 text-lg font-black text-sky-900">{data.phases.length}</p></button>
        <button onClick={onBoards} className="rounded-2xl bg-orange-100 p-4 text-center"><p className="text-xs font-black text-orange-800">行动项</p><p className="mt-1 text-lg font-black text-orange-900">{data.taskBoards.length}</p></button>
        <button onClick={onReview} className="rounded-2xl bg-violet-100 p-4 text-center"><p className="text-xs font-black text-violet-800">AI 复盘</p><p className="mt-1 text-lg font-black text-violet-900">{data.recentReviews.length}</p></button>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="本周专注" value={minutesToText(data.stats.weekMinutes)} tone="bg-sky-100" />
        <MetricCard label="连续记录" value={`${data.stats.streakDays}天`} tone="bg-emerald-100" />
        <MetricCard label="预计投入" value={weekExpected ? minutesToText(weekExpected) : '未设'} tone="bg-orange-100" />
        <button onClick={onStats} className="rounded-[1.6rem] bg-yellow-100 p-4 text-left"><p className="text-sm font-bold text-slate-500">查看统计</p><p className="mt-2 text-2xl font-black">{data.stats.completionRate}%</p></button>
      </section>

      <section className="rounded-[2rem] bg-white/80 p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-black">最近专注</h2>
        {activeBoards.length ? <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          <button onClick={() => onRecordFilter('all')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${recordFilter === 'all' ? 'bg-ink text-white' : 'bg-cream text-slate-600'}`}>全部</button>
          {activeBoards.map((board) => <button key={board.id} onClick={() => onRecordFilter(board.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${recordFilter === board.id ? 'bg-ink text-white' : 'bg-cream text-slate-600'}`}>{board.name}</button>)}
        </div> : null}
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
  const [generating, setGenerating] = useState(false);

  async function generateReview() {
    setGenerating(true);
    const response = await fetch('/api/ai-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    const payload = await response.json().catch(() => ({}));
    setGenerating(false);
    if (!response.ok) { alert(payload.error || '生成 AI 周复盘失败。'); return; }
    await onRefresh();
  }

  return (
    <div className="space-y-5 pt-4">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回首页</button>

      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">AI 复盘</p>
        <h1 className="mt-1 text-2xl font-black">从真实投入里看下一步</h1>
        <p className="mt-3 rounded-2xl bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-700">AI 会汇总本空间本周的专注时长、完成内容、受阻标记和每日状态，并以当前项目为重点给出建议。状态只用于观察线索，不作诊断或因果判断。</p>
        <button onClick={generateReview} disabled={generating} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{generating ? '正在生成周复盘…' : '生成本周 AI 复盘'}</button>
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
      <p className="text-sm font-black">{board?.name || '行动项'}</p>
      {Number(item.expected_minutes ?? 0) > 0 ? <><p className="mt-2 text-2xl font-black">{minutesToText(Number(item.expected_minutes))}</p><p className="text-xs opacity-75">预计投入</p></> : <p className="mt-2 text-xs opacity-75">本周主行动</p>}
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
        <p className="text-sm font-bold text-slate-500">本次行动：{board?.name || '未关联行动项'}</p>
        {boards.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {boards.map((item) => (
            <button key={item.id} onClick={() => onChangeBoard(item.id)} className={`rounded-2xl px-3 py-3 text-sm font-black ${item.id === session.taskBoardId ? 'bg-honey text-orange-900 ring-2 ring-orange-200' : 'bg-slate-50 text-slate-500'}`}>{item.name}</button>
          ))}
        </div> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onPause} className="rounded-[1.5rem] bg-white px-6 py-5 text-lg font-black shadow-soft">{paused ? '继续' : '暂停'}</button>
        <button onClick={onFinish} className="rounded-[1.5rem] bg-ink px-6 py-5 text-lg font-black text-white shadow-soft">结束并记录</button>
      </div>
    </div>
  );
}

function FinishView({ board, elapsedSeconds, content, outcome, saving, onContent, onOutcome, onBack, onSave }: {
  board: TaskBoard | null | undefined; elapsedSeconds: number; content: string; outcome: SessionOutcome; saving: boolean;
  onContent: (v: string) => void; onOutcome: (v: SessionOutcome) => void; onBack: () => void; onSave: () => void;
}) {
  return (
    <div className="space-y-5 pt-8">
      <button onClick={onBack} className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-600">返回计时</button>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">这一段时间过去了</p>
        <h1 className="mt-2 text-3xl font-black">{board?.name || '本次专注'} · {minutesToText(Math.round(elapsedSeconds / 60))}</h1>
        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-black text-slate-700">记录这段时间你真正做了什么 *</span>
          <textarea value={content} onChange={(e) => onContent(e.target.value)} rows={5} placeholder="例如：修改论文第三章 / 完成考公课程第五讲 / 浏览20个秋招岗位" className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
        </label>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {([
            ['progressed', '已推进'],
            ['completed', '已完成'],
            ['blocked', '被卡住'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => onOutcome(value)} className={`rounded-2xl px-3 py-3 text-sm font-black transition ${outcome === value ? 'bg-honey text-orange-900 ring-2 ring-orange-200' : 'bg-cream text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <p className="mt-3 text-xs font-bold leading-6 text-slate-500">时间长短不是目的。请诚实记录这段时间被交给了什么。</p>
        <button onClick={onSave} disabled={saving || !content.trim()} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '保存记录'}</button>
      </section>
    </div>
  );
}

function PlanView({ data, projectId, onBack, onBoards, onSaved }: { data: ProjectData; projectId: number; onBack: () => void; onBoards: () => void; onSaved: () => void }) {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const initialItems = new Map(data.currentPlanItems.map((item) => [item.task_board_id, Number(item.expected_minutes ?? (item.daily_minutes * 7))]));
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
  const today = toDateKey(new Date());
  const currentPhase = data.phases.find((phase) => phase.status === 'in_progress')
    || data.phases.find((phase) => phase.start_date <= today && phase.end_date >= today)
    || data.phases.find((phase) => phase.status === 'pending');
  const generatedTheme = selectedBoards.length ? `${selectedBoards.map((board) => board.name).join(' / ')}` : '本周推进';

  function toggleBoard(boardId: number) {
    if (selectedBoardIds.includes(boardId)) { setSelectedBoardIds(selectedBoardIds.filter((id) => id !== boardId)); return; }
    if (selectedBoardIds.length >= 3) { alert('本周最多保留 3 项推进事项。'); return; }
    setSelectedBoardIds([...selectedBoardIds, boardId]);
  }

  async function save() {
    if (selectedCount < 1) { alert('请至少选择 1 项本周推进事项。'); return; }
    setSaving(true);
    const response = await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, theme: generatedTheme, week_start_date: toDateKey(weekStart), week_end_date: toDateKey(weekEnd), items: selectedBoardIds.map((task_board_id) => ({ task_board_id, expected_minutes: minutesByBoard[task_board_id] || 0 })) }),
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
        <button onClick={onBoards} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-800">管理行动项</button>
      </div>
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-soft">
        <p className="text-sm font-bold text-slate-500">本周推进</p>
        <h1 className="mt-1 text-2xl font-black">{formatChineseDate(weekStart)}—{formatChineseDate(weekEnd)}</h1>
        <p className="mt-3 rounded-2xl bg-cream p-4 text-sm font-bold leading-6 text-slate-600">这一周只留 1—3 件最重要的事。预计投入是参考，不会要求每天固定完成同样时长。</p>
        {currentPhase ? <p className="mt-4 text-sm font-black text-slate-700">当前阶段：{currentPhase.name}</p> : null}

        {data.taskBoards.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-white p-5 text-sm font-bold leading-6 text-slate-600 ring-1 ring-orange-100">先添加可以在本周落地的一项行动。</div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.taskBoards.map((board) => {
              const selected = selectedBoardIds.includes(board.id);
              return (
                <button key={board.id} onClick={() => toggleBoard(board.id)} className={`rounded-2xl p-4 text-left ring-1 transition ${selected ? 'bg-honey text-orange-900 ring-orange-200' : 'bg-cream/70 text-slate-600 ring-orange-100'}`}>
                  <p className="font-black">{board.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-bold opacity-75">{board.goal || '为本周推进写下一个具体行动'}</p>
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
                  <div><p className="font-black">{board.name}</p><p className="mt-1 text-xs font-bold text-slate-500">预计投入（选填）</p></div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={5} step={5} value={minutesByBoard[board.id] || ''} onChange={(e) => setMinutesByBoard({ ...minutesByBoard, [board.id]: Number(e.target.value) })} className="w-24 rounded-xl border border-orange-100 bg-cream px-3 py-2 text-right font-black outline-none" />
                    <span className="text-sm font-bold text-slate-500">分钟</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold text-slate-600">已选择 {selectedCount} / 3 项{total > 0 ? `，预计投入 ${minutesToText(total)}` : ''}</p>
        <button onClick={save} disabled={saving || data.taskBoards.length === 0} className="mt-5 w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '确认本周推进'}</button>
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
    if (!name.trim()) { alert('请填写行动项名称。'); return; }
    if (kind === 'long_term' && !goal.trim()) { alert('长期任务必须设定目标。'); return; }
    setSaving(true);
    const response = await fetch('/api/task-boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, name, kind, goal }) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '创建行动项失败。'); return; }
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
    if (!response.ok) { alert(payload.error || '更新行动项失败。'); return; }
    await onSaved();
  }

  async function deleteBoard(board: TaskBoard) {
    if (!window.confirm(`确定删除板块"${board.name}"吗？`)) return;
    setSaving(true);
    const response = await fetch('/api/task-boards', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: board.id }) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { alert(payload.error || '删除行动项失败。'); return; }
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
        <p className="text-sm font-bold text-slate-500">行动清单</p>
        <h1 className="mt-1 text-2xl font-black">把下一步写具体</h1>
        <div className="mt-5 grid gap-3">
          {boards.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 ring-1 ring-orange-100">还没有行动项。</p>
          ) : boards.map((board) => {
            const draft = editing[board.id] || { kind: board.kind, goal: board.goal || '' };
            return (
              <div key={board.id} onMouseDown={() => startLongPress(board)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress} onTouchStart={() => startLongPress(board)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} className="rounded-2xl bg-cream/70 p-4 select-none">
                <div className="flex items-start justify-between gap-3"><div><p className="font-black">{board.name}</p></div></div>
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
        <h2 className="text-xl font-black">新增行动项</h2>
        <div className="mt-4 space-y-4">
          <Field label="行动项名称" value={name} onChange={setName} />
          <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">任务类型</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"><option value="temporary">临时任务：可选择是否设定目标</option><option value="long_term">长期任务：必须设定目标</option></select>
          </label>
          <Field label={kind === 'long_term' ? '目标（必填）' : '目标（选填）'} value={goal} onChange={setGoal} />
          <button onClick={createBoard} disabled={saving} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{saving ? '正在保存...' : '创建行动项'}</button>
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
  const outcomeLabels = { progressed: '已推进', completed: '已完成', blocked: '被卡住' };
  return <div className="space-y-3">{records.map((item) => <div key={item.id} className="rounded-2xl bg-cream/70 p-4"><div className="flex items-center justify-between gap-3"><p className="min-w-0 text-sm font-black">{item.study_date} · {item.task_board?.name || '本次专注'} · {minutesToText(item.duration_minutes)}</p><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${item.outcome_status === 'completed' ? 'bg-emerald-100 text-emerald-800' : item.outcome_status === 'blocked' ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800'}`}>{outcomeLabels[item.outcome_status || 'progressed']}</span></div><p className="mt-1 text-sm text-slate-600">{item.content}</p></div>)}</div>;
}

function Field({ label, value, onChange, type = 'text', multiline = false, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full resize-none rounded-2xl border border-orange-100 bg-cream/70 px-4 py-3 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-3 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
      )}
    </label>
  );
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
