'use client';

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useState } from 'react';

type Space = { id: number; name: string };
type Panel = 'login' | 'create' | 'manage';

export default function LoginForm() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [spaceLoading, setSpaceLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [panel, setPanel] = useState<Panel>('login');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [deletingSpaceId, setDeletingSpaceId] = useState<number | null>(null);

  useEffect(() => { loadSpaces(); }, []);

  async function loadSpaces() {
    setSpaceLoading(true);
    const response = await fetch('/api/spaces');
    const payload = await response.json().catch(() => []);
    setSpaceLoading(false);
    if (response.ok) {
      setSpaces(payload);
      setSelectedSpaceId((currentId) => (
        payload.some((space: Space) => space.id === currentId)
          ? currentId
          : payload[0]?.id || null
      ));
    } else {
      setError(payload.error || '读取空间列表失败。');
    }
  }

  function openPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setError('');
    setSuccess('');
    if (nextPanel !== 'manage') setAdminPassword('');
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpaceId) { setError('请先选择一个空间。'); return; }
    setLoading(true); setError(''); setSuccess('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: selectedSpaceId, password }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '空间密码不正确，请再试一次。'); return; }
    window.location.href = '/';
  }

  async function handleCreateSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim() || !createPassword.trim()) { setError('请填写空间名称和密码。'); return; }
    setLoading(true); setError(''); setSuccess('');
    const response = await fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: createName, password: createPassword }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '创建空间失败。'); return; }
    setPanel('login');
    setSelectedSpaceId(payload.id);
    setPassword(createPassword);
    setCreateName('');
    setCreatePassword('');
    setSuccess('空间创建成功，可以直接进入。');
    await loadSpaces();
  }

  async function handleDeleteSpace(space: Space) {
    if (!adminPassword) {
      setError('请输入开发者管理密码。');
      return;
    }

    const confirmed = window.confirm(
      `确定删除空间“${space.name}”吗？该空间下的所有项目、计划、记录和复盘都会被永久删除。`,
    );
    if (!confirmed) return;

    setDeletingSpaceId(space.id);
    setError('');
    setSuccess('');

    const response = await fetch('/api/admin/spaces', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: space.id, adminPassword }),
    });
    const payload = await response.json().catch(() => ({}));
    setDeletingSpaceId(null);

    if (!response.ok) {
      setError(payload.error || '删除空间失败。');
      return;
    }

    setAdminPassword('');
    setSuccess(`空间“${space.name}”及其全部数据已删除。再次删除需要重新输入管理密码。`);
    await loadSpaces();
  }

  if (spaceLoading && spaces.length === 0) {
    return (
      <main className="relative min-h-screen overflow-hidden px-5 py-8 text-ink">
        <LoginClayCountryside />
        <div className="login-panel-wrap relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-md place-items-center">
          <section className="login-clay-card rounded-[2.2rem] bg-white/90 px-7 py-6 text-center shadow-soft ring-1 ring-white/70 backdrop-blur-xl">
            <p className="font-black text-slate-600">正在进入 MyTime…</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-8 text-ink">
      <LoginClayCountryside />
      <div className="login-panel-wrap relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <section className="login-clay-card rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white/70 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <div className="relative inline-block rotate-1" aria-label="MyTime">
              <span
                className="relative z-10 inline-block text-[2.8rem] font-black leading-none tracking-[-0.12em] text-[#2F405A]"
                style={{ fontFamily: '"Caveat", "Patrick Hand", cursive', textShadow: '3px 3px 0 #FFFAF0, 6px 6px 0 #FFDDA7, 9px 9px 18px rgba(193,125,73,0.18)' }}
              >
                MyTime
              </span>
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#F08A69]" aria-hidden="true" />
              <span className="absolute -right-5 top-2 h-2.5 w-2.5 rounded-full bg-[#9ED8FF]" aria-hidden="true" />
              <span className="absolute right-0 -bottom-1 h-2.5 w-2.5 rounded-full bg-[#BFECCF]" aria-hidden="true" />
            </div>
          </div>
          <div className="mb-5 flex justify-center gap-2">
            {panel === 'login' ? (
              <>
                <button onClick={() => openPanel('create')} className="rounded-full bg-[linear-gradient(135deg,#FFF0CD,#FFD49D)] px-4 py-2 text-sm font-black text-[#A15B30] shadow-[0_5px_12px_rgba(237,164,89,0.12)] ring-1 ring-[#FFE0B5]">
                  创建空间
                </button>
                <button onClick={() => openPanel('manage')} className="rounded-full bg-[linear-gradient(135deg,#ECF7FF,#D7EAFF)] px-4 py-2 text-sm font-black text-[#4F7294] shadow-[0_5px_12px_rgba(126,174,211,0.12)] ring-1 ring-[#D3E8F8]">
                  管理空间
                </button>
              </>
            ) : (
              <button onClick={() => openPanel('login')} className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm ring-1 ring-slate-100">
                返回登录
              </button>
            )}
          </div>

          {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
          {success ? <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</p> : null}

          {panel === 'create' ? (
            <form onSubmit={handleCreateSpace} className="space-y-4">
              <Input label="空间名称" value={createName} onChange={setCreateName} />
              <Input label="空间密码" type="password" value={createPassword} onChange={setCreatePassword} />
              <button disabled={loading} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{loading ? '正在创建...' : '创建空间'}</button>
            </form>
          ) : null}

          {panel === 'manage' ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
                删除空间会同时永久删除其中的项目、计划、时间记录和复盘数据。
              </div>
              <Input label="开发者管理密码" type="password" value={adminPassword} onChange={setAdminPassword} />
              <div className="space-y-3">
                {spaceLoading ? <p className="text-sm font-bold text-slate-500">正在读取空间...</p> : null}
                {!spaceLoading && spaces.length === 0 ? (
                  <p className="rounded-2xl bg-cream/70 p-4 text-sm font-bold text-slate-500">系统中暂无空间。</p>
                ) : null}
                {spaces.map((space) => (
                  <div key={space.id} className="flex items-center justify-between gap-3 rounded-2xl bg-cream/70 p-4 ring-1 ring-orange-100">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-700">{space.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">空间 ID：{space.id}</p>
                    </div>
                    <button
                      type="button"
                      disabled={deletingSpaceId !== null}
                      onClick={() => handleDeleteSpace(space)}
                      className="shrink-0 rounded-xl bg-red-100 px-4 py-2 text-sm font-black text-red-700 disabled:opacity-50"
                    >
                      {deletingSpaceId === space.id ? '删除中...' : '删除'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {panel === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">选择空间</span>
                <select value={selectedSpaceId || ''} onChange={(event) => setSelectedSpaceId(Number(event.target.value))} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-4 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100">
                  {spaceLoading ? <option>正在读取空间...</option> : null}
                  {!spaceLoading && spaces.length === 0 ? <option value="">暂无空间，请先创建</option> : null}
                  {spaces.map((space) => (<option key={space.id} value={space.id}>{space.name}</option>))}
                </select>
              </label>
              <Input label="空间密码" type="password" value={password} onChange={setPassword} />
              <button type="submit" disabled={loading || !password.trim() || !selectedSpaceId} className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-black text-white shadow-lg shadow-slate-300 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? '正在进入...' : '进入空间'}
              </button>
              <a href="/help" className="block pt-1 text-center text-xs font-semibold tracking-[0.08em] text-slate-400 underline-offset-4 transition hover:text-[#A15B30] hover:underline">帮助手册</a>
            </form>
          ) : null}
        </section>
      </div>
      <footer className="absolute bottom-5 left-0 right-0 z-10 text-center text-[11px] font-bold tracking-[0.08em] text-[#6B7C91]/75">MyTime © 2026</footer>
    </main>
  );
}

function LoginClayCountryside() {
  return (
    <div className="login-clay-world" aria-hidden="true">
      <div className="login-clay-sky" />
      <ClayCloud className="login-cloud-one" />
      <ClayCloud className="login-cloud-two" />
      <ClayCloud className="login-cloud-three" />
      <div className="login-clay-hill login-clay-hill-back" />
      <div className="login-clay-hill login-clay-hill-front" />
      <div className="login-clay-meadow">
        <ClayHouse className="login-house-left" />
        <ClayTree className="login-tree-left" />
        <ClayTree className="login-tree-right" tall />
        <ClayHouse className="login-house-right" peach />
        <ClaySheep className="login-sheep-left" grazing />
        <ClaySheep className="login-sheep-middle" />
        <ClaySheep className="login-sheep-right" grazing />
        <span className="login-clay-flower login-clay-flower-one" />
        <span className="login-clay-flower login-clay-flower-two" />
        <span className="login-clay-flower login-clay-flower-three" />
      </div>
      <div className="login-clay-vignette" />
    </div>
  );
}

function ClayCloud({ className }: { className: string }) {
  return <div className={`login-clay-cloud ${className}`}><i /><i /><i /></div>;
}

function ClayHouse({ className, peach = false }: { className: string; peach?: boolean }) {
  return (
    <div className={`login-clay-house ${peach ? 'login-clay-house-peach' : ''} ${className}`}>
      <span className="login-house-roof" /><span className="login-house-wall" /><span className="login-house-door" /><span className="login-house-window login-house-window-left" /><span className="login-house-window login-house-window-right" />
    </div>
  );
}

function ClayTree({ className, tall = false }: { className: string; tall?: boolean }) {
  return <div className={`login-clay-tree ${tall ? 'login-clay-tree-tall' : ''} ${className}`}><span className="login-tree-crown login-tree-crown-one" /><span className="login-tree-crown login-tree-crown-two" /><span className="login-tree-crown login-tree-crown-three" /><span className="login-tree-trunk" /></div>;
}

function ClaySheep({ className, grazing = false }: { className: string; grazing?: boolean }) {
  return (
    <div className={`login-clay-sheep ${grazing ? 'login-clay-sheep-grazing' : ''} ${className}`}>
      <span className="login-sheep-body"><i /><i /><i /><i /><i /></span><span className="login-sheep-head" /><span className="login-sheep-leg login-sheep-leg-one" /><span className="login-sheep-leg login-sheep-leg-two" />
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-orange-100 bg-cream/70 px-4 py-3 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
    </label>
  );
}
