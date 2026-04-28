import { useState, useEffect, useCallback } from 'react';
import type { Source } from '../types';
import { fetchSources, saveSource, deleteSourceApi, fetchRSS, validateRSSUrl, addNews } from '../lib/fetcher';

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const SOURCE_TYPES = ['RSS Feed', '新闻网站', '博客', '官方公告', '社交媒体', '其他'];

interface FormData {
  name: string;
  url: string;
  type: string;
  description: string;
  tagInput: string;
  tags: string[];
}

const emptyForm: FormData = {
  name: '', url: '', type: 'RSS Feed', description: '', tagInput: '', tags: [],
};

type UrlCheckState = 'idle' | 'checking' | 'ok' | 'error';

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [urlCheck, setUrlCheck] = useState<{ state: UrlCheckState; msg: string }>({ state: 'idle', msg: '' });
  const [urlCheckLock, setUrlCheckLock] = useState(false);

  // 自定义确认弹窗状态
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; articleCount: number } | null>(null);

  // 从后端加载信息源
  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSources();
      setSources(data);
    } catch (err) {
      console.error('加载信息源失败:', err);
      showToast('加载信息源失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setUrlCheck({ state: 'idle', msg: '' });
    setUrlCheckLock(false);
    setShowModal(true);
  };

  const openEdit = (src: Source) => {
    setEditingId(src.id);
    setForm({ name: src.name, url: src.url, type: src.type, description: src.description, tagInput: '', tags: [...src.tags] });
    setUrlCheck({ state: 'idle', msg: '' });
    setUrlCheckLock(false);
    setShowModal(true);
  };

  const handleUrlChange = (url: string) => {
    setForm(f => ({ ...f, url }));
    setUrlCheck({ state: 'idle', msg: '' });
  };

  const handleCheckUrl = async () => {
    const url = form.url.trim();
    if (!url) { setUrlCheck({ state: 'error', msg: '请先输入 RSS 地址' }); return; }
    setUrlCheckLock(true);
    setUrlCheck({ state: 'checking', msg: '验证中…' });
    try {
      const result = await validateRSSUrl(url);
      if (result.valid) { setUrlCheck({ state: 'ok', msg: result.message }); }
      else { setUrlCheck({ state: 'error', msg: result.message }); }
    } catch { setUrlCheck({ state: 'error', msg: '验证请求失败' }); }
    finally { setUrlCheckLock(false); }
  };

  const handleAddTag = () => {
    const tag = form.tagInput.trim();
    if (tag && !form.tags.includes(tag)) setForm(f => ({ ...f, tags: [...f.tags, tag], tagInput: '' }));
  };

  const handleRemoveTag = (tag: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return;

    if (editingId) {
      // 更新现有源
      const src = sources.find(s => s.id === editingId)!;
      await saveSource({
        ...src,
        name: form.name,
        url: form.url,
        type: form.type,
        description: form.description,
        tags: form.tags,
      });
      showToast('信息源已更新');
    } else {
      // 新增
      const newSrc: Source = {
        id: generateId(),
        name: form.name,
        url: form.url,
        type: form.type,
        description: form.description,
        tags: form.tags,
        status: 'inactive',
        createdAt: new Date().toISOString(),
      };
      await saveSource(newSrc);
      showToast('信息源已添加');
    }

    setShowModal(false);
    loadSources(); // 刷新列表
  };

  const handleToggleStatus = async (src: Source) => {
    const newStatus = src.status === 'active' ? 'inactive' : 'active';
    await saveSource({ ...src, status: newStatus });

    if (newStatus === 'active') {
      showToast(`已启用「${src.name}」，正在抓取数据…`);
      setFetchingId(src.id);
      try {
        const articles = await fetchRSS({ ...src, status: 'active' });
        if (articles.length > 0) {
          await addNews(articles);
        }
        await saveSource({ ...src, status: 'active', lastFetchedAt: new Date().toISOString() });
        showToast(`「${src.name}」抓取完成，新增 ${articles.length} 条动态`);
      } catch (e: unknown) {
        showToast(`抓取失败: ${e instanceof Error ? e.message : '未知错误'}`);
      } finally { setFetchingId(null); }
    } else {
      showToast(`已停用「${src.name}」`);
    }

    loadSources(); // 刷新列表
  };

  // 触发删除确认弹窗
  const handleDeleteClick = async (id: string) => {
    const name = sources.find(s => s.id === id)?.name || '';
    // 查询关联的动态数量（通过后端）
    let articleCount = 0;
    try {
      const res = await fetch(`/api/news?source_id=${id}&pageSize=1`);
      if (res.ok) {
        const data = await res.json();
        articleCount = data.pagination?.total || 0;
      }
    } catch { /* ignore */ }
    setConfirmTarget({ id, name, articleCount });
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteSourceApi(confirmTarget.id);
      showToast(`信息源已删除`);
      setConfirmTarget(null);
      loadSources(); // 刷新列表
    } catch (err) {
      showToast('删除失败');
    }
  };

  const canSave = form.name.trim() && form.url.trim();
  const urlInputClass = `input ${urlCheck.state === 'ok' ? '!border-green-500' : urlCheck.state === 'error' ? '!border-red-500' : ''}`;

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center py-16">
        <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="ml-3 text-slate-400">加载中…</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-slate-800 border border-slate-600 text-slate-100 text-sm px-4 py-2.5 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">信息源管理</h2>
          <p className="text-sm text-slate-400 mt-0.5">管理您的 RSS 订阅源，启用后将自动抓取行业动态</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增信息源
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '全部信息源', value: sources.length, color: 'text-blue-400' },
          { label: '已启用', value: sources.filter(s => s.status === 'active').length, color: 'text-green-400' },
          { label: '已停用', value: sources.filter(s => s.status === 'inactive').length, color: 'text-slate-400' },
        ].map(stat => (
          <div key={stat.label} className="card p-4 flex flex-col items-center justify-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {sources.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <svg className="w-12 h-12 mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <p className="text-sm text-slate-500">暂无信息源，点击「新增信息源」开始添加</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">标签</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">最后抓取</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400 uppercase tracking-wider text-xs">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sources.map(src => (
                <tr key={src.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{src.name}</div>
                    <a href={src.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline truncate block max-w-xs">
                      {src.url}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{src.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(src.tags || []).map(t => (
                        <span key={t} className="badge" style={{ backgroundColor: 'rgba(100,116,139,0.3)', color: '#94a3b8' }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${src.status === 'active' ? 'text-green-400' : 'text-slate-500'}`}
                      style={src.status === 'active' ? { backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80' } : { backgroundColor: 'rgba(100,116,139,0.2)', color: '#64748b' }}>
                      {src.status === 'active' ? '● 启用中' : '○ 已停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {src.lastFetchedAt ? new Date(src.lastFetchedAt).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(src)}
                        disabled={fetchingId === src.id}
                        className="btn"
                        style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: fetchingId === src.id ? 'not-allowed' : 'pointer',
                          opacity: fetchingId === src.id ? 0.5 : 1,
                          ...(src.status === 'active'
                            ? { backgroundColor: 'rgba(251,146,60,0.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.35)' }
                            : { backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)' }),
                        }}
                      >
                        {fetchingId === src.id ? (
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : null}
                        {src.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button type="button" onClick={() => openEdit(src)} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>编辑</button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(src.id)}
                        className="btn"
                        style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 8,
                          backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                          transition: 'all 150ms ease',
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 自定义删除确认弹窗 ===== */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg style={{ width: 20, height: 20, color: '#f87171' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div><h3 className="text-base font-semibold text-slate-100">确认删除</h3><p className="text-sm text-slate-400 mt-0.5">此操作不可撤销</p></div>
              </div>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-slate-900/60 rounded-xl p-4 mb-5 border border-slate-700/50">
                <p className="text-sm text-slate-300">
                  确定要删除信息源 <span style={{ color: '#f87171', fontWeight: 600 }}>「{confirmTarget.name}」</span> 吗？<br />
                  <span className="text-amber-400 font-medium">将同时删除该信息源下的 {confirmTarget.articleCount} 条历史动态</span>
                  <span className="text-slate-500 text-xs mt-1 block">此操作不可撤销。</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button type="button" onClick={() => setConfirmTarget(null)} className="btn btn-secondary flex-1 justify-center py-2.5">取消</button>
              <button type="button" onClick={handleConfirmDelete} className="btn flex-1 justify-center py-2.5" style={{ backgroundColor: 'rgba(239,68,68,0.85)', color: '#ffffff', border: '1px solid rgba(239,68,68,0.5)', fontWeight: 600 }}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-base font-semibold text-slate-100">{editingId ? '编辑信息源' : '新增信息源'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost p-1.5 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">名称 *</label>
                <input className="input" placeholder="如：36氪快讯" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">RSS地址 *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input className={urlInputClass} placeholder="https://example.com/feed" value={form.url} onChange={e => handleUrlChange(e.target.value)} />
                    <button type="button" onClick={handleCheckUrl} disabled={urlCheck.state === 'checking' || !form.url.trim() || urlCheckLock} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, padding: '3px 10px', borderRadius: 6, backgroundColor: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', cursor: (!form.url.trim() || urlCheckLock) ? 'not-allowed' : 'pointer', opacity: (!form.url.trim() || urlCheckLock) ? 0.5 : 1 }}>
                      {urlCheck.state === 'checking' ? '验证中…' : '验证'}
                    </button>
                  </div>
                </div>
                {urlCheck.state === 'ok' && (<p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#4ade80' }}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{urlCheck.msg}</p>)}
                {urlCheck.state === 'error' && (<p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#f87171' }}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>{urlCheck.msg}</p>)}
                {urlCheck.state === 'idle' && (<p className="text-xs text-slate-500 mt-1">填写后点击「验证」检查链接是否可用</p>)}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">类型</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">描述</label>
                <textarea className="input resize-none" rows={2} placeholder="简短描述该信息源的内容" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">标签</label>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="输入标签后按回车" value={form.tagInput} onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())} />
                  <button type="button" className="btn btn-secondary" onClick={handleAddTag}>添加</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map(t => (<span key={t} className="badge flex items-center gap-1 pr-1" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{t}<button type="button" onClick={() => handleRemoveTag(t)} className="text-blue-400 hover:text-blue-200 leading-none">×</button></span>))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}>{editingId ? '保存修改' : '添加信息源'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
