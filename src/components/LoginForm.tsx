'use client';

import { FormEvent, useEffect, useState } from 'react';

type Space = { id: number; name: string };

export default function LoginForm() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [spaceLoading, setSpaceLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  useEffect(() => { loadSpaces(); }, []);

  async function loadSpaces() {
    setSpaceLoading(true);
    const response = await fetch('/api/spaces');
    const payload = await response.json().catch(() => []);
    setSpaceLoading(false);
    if (response.ok) {
      setSpaces(payload);
      if (payload[0]?.id) setSelectedSpaceId(payload[0].id);
    } else {
      setError(payload.error || '读取空间列表失败。');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpaceId) { setError('请先选择一个空间。'); return; }
    setLoading(true); setError('');
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
    setLoading(true); setError('');
    const response = await fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: createName, password: createPassword }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || '创建空间失败。'); return; }
    setShowCreate(false);
    setSelectedSpaceId(payload.id);
    setPassword(createPassword);
    await loadSpaces();
  }

  return (
    <main className="min-h-screen px-5 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <section className="rounded-[2.2rem] bg-white/90 p-6 shadow-soft ring-1 ring-white/70 backdrop-blur">
          <div className="mb-8 text-center">
            <div className="mb-5 inline-flex rounded-full bg-honey/70 px-4 py-2 text-sm font-black text-orange-800">MyTime</div>
            <h1 className="text-4xl font-black tracking-tight">感知时间</h1>
          </div>

          <div className="mb-5 flex justify-center">
            <button onClick={() => setShowCreate(!showCreate)} className="rounded-full bg-mint/60 px-4 py-2 text-sm font-black text-emerald-800">
              {showCreate ? '返回登录' : '创建空间'}
            </button>
          </div>

          {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}

          {showCreate ? (
            <form onSubmit={handleCreateSpace} className="space-y-4">
              <Input label="空间名称" value={createName} onChange={setCreateName} />
              <Input label="空间密码" type="password" value={createPassword} onChange={setCreatePassword} />
              <button disabled={loading} className="w-full rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-50">{loading ? '正在创建...' : '创建空间'}</button>
            </form>
          ) : (
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
          )}
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
