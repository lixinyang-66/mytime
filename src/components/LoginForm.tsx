'use client';

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

  return (
    <main className="min-h-screen px-5 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <section className="rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white/70 backdrop-blur">
          <div className="mb-6 text-center">
            <div className="inline-flex rounded-full bg-honey/70 px-4 py-2 text-sm font-black text-orange-800">MyTime</div>
          </div>

          <div className="mb-5 flex justify-center gap-2">
            {panel === 'login' ? (
              <>
                <button onClick={() => openPanel('create')} className="rounded-full bg-mint/60 px-4 py-2 text-sm font-black text-emerald-800">
                  创建空间
                </button>
                <button onClick={() => openPanel('manage')} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-800">
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
            </form>
          ) : null}
        </section>
      </div>
    </main>
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
