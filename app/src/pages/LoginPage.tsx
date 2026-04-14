import { useState } from 'react';
import { login } from '../lib/storage';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    if (login(username, password)) {
      onLogin();
    } else {
      setError('用户名或密码错误');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #020617 0%, #0f172a 40%, #1e3a5f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: '20%', left: '15%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '15%', right: '20%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #2563eb, #06b6d4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 0 32px rgba(59,130,246,0.4)' }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>行业动态监控</h1>
          <p style={{ fontSize: 14, color: '#475569' }}>Industry Intelligence Monitor</p>
        </div>

        {/* Login Card */}
        <div style={{ backgroundColor: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: 20, padding: 32, backdropFilter: 'blur(16px)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 24 }}>登录账户</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>用户名</label>
              <input className="input" type="text" placeholder="请输入用户名"
                value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>密码</label>
              <input className="input" type="password" placeholder="请输入密码"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" required />
            </div>
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#f87171', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base" style={{ marginTop: 4, fontSize: 15 }}>
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  登录中…
                </>
              ) : '登 录'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#334155', marginTop: 20 }}>行业动态监控系统 v1.0</p>
      </div>
    </div>
  );
}
