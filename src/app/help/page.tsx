const steps = [
  ['01', '建立空间', '在登录页创建一个只属于你的空间，并设置密码。空间里的项目、专注记录和复盘都只属于你。'],
  ['02', '新建项目', '写下项目名称、初始状态、目标和截止日期。每一件想完成的事，都可以成为一个可推进的项目。'],
  ['03', '确认计划图', 'AI 会结合系统知识库生成阶段计划。检查阶段与日期后，你仍可按自己的节奏人工编辑或重新生成。'],
  ['04', '配置本周专注', '选择这一周要推进的项目，为每个项目分配每天愿意投入的时间，让计划与真实生活相互配合。'],
  ['05', '专注并留下记录', '开始一段专注；结束时选择对应项目，并写下这段时间具体完成了什么。真实记录比完美记录更重要。'],
  ['06', '复盘与调整', '项目记录和本周投入会沉淀为复盘依据。看见已经完成的部分，再决定下一步怎样继续推进。'],
];

function ScreenFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[1.7rem] border border-orange-100 bg-white shadow-[0_18px_35px_rgba(88,105,135,0.10)]">
    <div className="flex items-center gap-1.5 border-b border-orange-50 bg-[#fffaf3] px-4 py-3"><i className="h-2 w-2 rounded-full bg-[#ffb3a4]" /><i className="h-2 w-2 rounded-full bg-[#ffd78c]" /><i className="h-2 w-2 rounded-full bg-[#aee6bf]" /><span className="ml-2 text-xs font-black text-slate-500">{title}</span></div>
    <div className="p-4">{children}</div>
  </div>;
}

function ProjectExample() {
  return <ScreenFrame title="示例：项目计划图">
    <p className="text-xs font-bold text-slate-400">项目计划图</p><h3 className="mt-1 text-xl font-black text-ink">研究生毕业论文</h3><p className="mt-1 text-xs font-bold text-slate-500">2026/08/06 → 2026/12/31 · 147 天</p>
    <div className="mt-4 space-y-2.5">
      {[
        ['文献精读与问题聚焦', '08/06 — 09/07', 'bg-orange-200', '进行中'],
        ['研究设计与数据收集', '09/08 — 10/05', 'bg-emerald-200', '未开始'],
        ['模型构建与数据分析', '10/06 — 11/09', 'bg-sky-200', '未开始'],
        ['初稿撰写与修改', '11/10 — 12/31', 'bg-violet-200', '未开始'],
      ].map(([name, date, color, status]) => <div key={name} className="rounded-2xl border border-orange-100 bg-[#fffdf9] p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-black text-ink">{name}</p><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">{status}</span></div><p className="mt-1 text-[11px] font-bold text-slate-500">{date}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><i className={`block h-full w-[42%] rounded-full ${color}`} /></div></div>)}
    </div>
  </ScreenFrame>;
}

function FocusExample() {
  return <ScreenFrame title="示例：本周专注配置">
    <p className="text-xs font-bold text-slate-400">8 月 6 日 — 8 月 12 日</p><h3 className="mt-1 text-xl font-black text-ink">本周专注时间</h3>
    <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#fff7ed] px-4 py-3"><div><p className="text-[11px] font-bold text-slate-400">每天可安排</p><p className="text-lg font-black text-ink">09:00 — 18:00</p></div><button className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#A15B30] shadow-sm">编辑</button></div>
    <div className="mt-3 space-y-2">{[['研究生毕业论文', '文献精读与问题聚焦', '60 分钟', 'bg-orange-200'], ['三个月健康减重', '建立身体基线', '60 分钟', 'bg-violet-200']].map(([project, phase, minutes, color]) => <div key={project} className="flex items-center justify-between rounded-2xl border border-orange-100 p-3"><div><p className="text-sm font-black text-ink">{project}</p><p className="mt-1 text-[11px] font-bold text-slate-500">当前阶段：{phase}</p></div><span className={`rounded-xl px-2 py-2 text-xs font-black text-ink ${color}`}>{minutes}/天</span></div>)}</div>
    <p className="mt-3 text-right text-xs font-bold text-slate-500">每日已分配 2 小时 · 剩余 7 小时</p>
  </ScreenFrame>;
}

function RecordExample() {
  return <ScreenFrame title="示例：结束专注并记录">
    <p className="text-xs font-bold text-slate-400">本次专注</p><h3 className="mt-1 text-3xl font-black text-ink">45 分钟</h3>
    <label className="mt-4 block text-xs font-black text-slate-600">这段时间用在哪个项目？<div className="mt-2 flex items-center justify-between rounded-xl border border-orange-200 bg-[#fffdf9] px-3 py-3 text-sm text-ink">研究生毕业论文 · 文献精读与问题聚焦 <span>⌄</span></div></label>
    <label className="mt-3 block text-xs font-black text-slate-600">记录这段时间你真正做了什么？<div className="mt-2 min-h-24 rounded-xl border border-orange-200 bg-[#fffdf9] p-3 text-xs font-bold leading-5 text-slate-500">梳理了文献综述的理论框架，补充并标注了 4 篇核心文献。</div></label>
    <button className="mt-4 w-full rounded-xl bg-[#ffad45] py-3 text-sm font-black text-white">保存记录</button>
  </ScreenFrame>;
}

export default function HelpPage() {
  return <main className="min-h-screen bg-[linear-gradient(135deg,#fff7e9_0%,#fffaf4_48%,#eef7ff_100%)] px-5 py-8 text-ink sm:px-8 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <header className="flex items-center justify-between gap-4"><a href="/login" className="rounded-full bg-white/90 px-4 py-2 text-sm font-black text-slate-600 shadow-sm">← 返回登录</a><span className="rounded-full bg-[#fff0d7] px-4 py-2 text-xs font-black text-[#a15b30]">MyTime 帮助手册</span></header>
      <section className="mt-8 rounded-[2.5rem] bg-white/85 p-7 shadow-soft ring-1 ring-white/80 sm:p-11"><p className="text-sm font-black text-[#e87832]">感知时间｜Feeling Your Time</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">欢迎来到 MyTime</h1><p className="mt-5 max-w-3xl text-base font-bold leading-8 text-slate-600">MyTime 是一个把“想做”变成“正在发生”的个人时间管理系统。把每一件想完成的事，变成一个值得认真推进的项目；借鉴项目管理的思路，用 AI 帮你生成可执行的计划，记录每一次真实投入，并陪你复盘、调整。</p></section>
      <section className="mt-10"><p className="text-sm font-black text-[#e87832]">一、六步开始使用</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([number, title, text]) => <article key={number} className="rounded-3xl bg-white/85 p-5 shadow-sm ring-1 ring-white"><p className="text-sm font-black text-[#f09a3b]">{number}</p><h2 className="mt-2 text-xl font-black">{title}</h2><p className="mt-2 text-sm font-bold leading-6 text-slate-500">{text}</p></article>)}</div></section>
      <section className="mt-12"><p className="text-sm font-black text-[#e87832]">二、示例</p><h2 className="mt-2 text-3xl font-black">一个项目，从计划到真实投入</h2><div className="mt-6 grid items-start gap-6 lg:grid-cols-3"><ProjectExample /><FocusExample /><RecordExample /></div></section>
      <section className="mt-12"><p className="text-sm font-black text-[#e87832]">三、AI计划与复盘</p><div className="mt-4 grid gap-5 md:grid-cols-2"><article className="rounded-[2rem] bg-[#fff0d8] p-7"><h2 className="text-2xl font-black">从目标到计划</h2><p className="mt-3 text-sm font-bold leading-7 text-slate-600">创建项目时，AI 会先参考系统知识库中的项目管理方法和优秀计划案例，再结合你的项目目标、初始状态与期限，生成可继续编辑的阶段计划。它提供起点，计划始终由你确认。</p></article><article className="rounded-[2rem] bg-[#eee7fb] p-7"><h2 className="text-2xl font-black">从记录到复盘</h2><p className="mt-3 text-sm font-bold leading-7 text-slate-600">每次专注留下的项目和具体内容，会成为项目进度与本周复盘的依据。AI 帮你整理已经发生的投入、看见持续的变化，并为下一步调整提供参考。</p></article></div></section>
    </div>
  </main>;
}
