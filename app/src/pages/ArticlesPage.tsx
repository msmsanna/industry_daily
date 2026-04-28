import { useState, useEffect, useCallback } from 'react';
import type { Article } from '../types';
import { fetchNewsList, deleteNews, fetchAllActiveSources, fetchSources } from '../lib/fetcher';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { addFavourite, removeFavourite, getFavourites, isFavourited } from '../lib/storage';

// 统一的主按钮样式（与 SourcesPage 新增信息源按钮完全一致）
const primaryBtnClass = 'btn btn-primary';

// 分页参数
const PAGE_SIZE = 20;

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [keyword, setKeyword] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  // 分页状态
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 自定义删除确认弹窗
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);

  // 加载数据
  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof fetchNewsList>[0] = {
        page,
        pageSize: PAGE_SIZE,
        mode: 'fuzzy',
      };
      if (dateFilter) {
        params.dateFrom = dateFilter;
        params.dateTo = dateFilter;
      }
      if (keyword.trim()) {
        params.keyword = keyword.trim();
      }

      const response = await fetchNewsList(params);
      setArticles(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      console.error('加载新闻失败:', err);
      showToast('加载新闻失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  }, [page, dateFilter, keyword]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // 搜索条件变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [keyword, dateFilter]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleFetchAll = async () => {
    const sources = await fetchSources();
    const active = sources.filter(s => s.status === 'active');
    if (active.length === 0) { showToast('没有已启用的信息源，请先在「信息源管理」中启用'); return; }
    setFetching(true);
    setFetchProgress('正在抓取 0/' + active.length + '…');
    try {
      const result = await fetchAllActiveSources(sources, (done, total, name) => {
        setFetchProgress(name ? `正在抓取「${name}」(${done + 1}/${total})` : '抓取完成');
      });
      // 刷新列表
      loadArticles();
      showToast(`抓取完成：成功 ${result.success} 个，失败 ${result.failed} 个`);
    } catch { showToast('抓取失败，请检查网络连接'); }
    finally { setFetching(false); setFetchProgress(''); }
  };

  // 触发自定义删除确认弹窗
  const handleDeleteClick = (article: Article) => {
    setConfirmTarget({ id: article.id, title: article.title });
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteNews(confirmTarget.id);
      showToast('动态已删除');
      // 刷新列表
      loadArticles();
    } catch (err) {
      showToast('删除失败');
    }
    setConfirmTarget(null);
  };

  // 收藏/取消收藏
  const handleToggleFavourite = (article: Article) => {
    const favs = getFavourites();
    if (favs.some(a => a.id === article.id)) {
      removeFavourite(article.id);
      showToast('已取消收藏');
    } else {
      addFavourite(article);
      showToast('已添加到收藏');
    }
    // 强制刷新组件以更新按钮状态
    setArticles([...articles]);
  };

  const formatDate = (iso: string) => {
    try { return format(parseISO(iso), 'MM-dd HH:mm', { locale: zhCN }); }
    catch { return iso.slice(0, 16); }
  };

  // 分页组件
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button
          type="button"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="btn btn-secondary px-3 py-1.5"
          style={{ opacity: page === 1 ? 0.5 : 1 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-slate-500">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: p === page ? 'rgba(99,102,241,0.9)' : 'transparent',
                color: p === page ? '#fff' : '#94a3b8',
                border: p === page ? 'none' : '1px solid #334155',
              }}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="btn btn-secondary px-3 py-1.5"
          style={{ opacity: page === totalPages ? 0.5 : 1 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-slate-800 border border-slate-600 text-slate-100 text-sm px-4 py-2.5 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">行业动态</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            共 {total} 条动态
            {totalPages > 1 && `，第 ${page}/${totalPages} 页`}
          </p>
        </div>
        {/* 与 SourcesPage 新增信息源按钮样式完全一致 */}
        <button type="button" className={primaryBtnClass} onClick={handleFetchAll} disabled={fetching}>
          {fetching ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {fetchProgress || '抓取中…'}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              全部抓取
            </>
          )}
        </button>
      </div>

      <div className="card p-4 mb-5 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input className="input flex-1" placeholder="关键词搜索（标题/摘要）" value={keyword}
            onChange={e => setKeyword(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input className="input" type="date" value={dateFilter}
            onChange={e => setDateFilter(e.target.value)} style={{ width: 160 }} />
          {dateFilter && (
            <button type="button" className="btn btn-ghost py-1 px-2 text-xs text-slate-400" onClick={() => setDateFilter('')}>清除</button>
          )}
        </div>
      </div>

      {/* ===== 动态删除确认弹窗 ===== */}
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
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  backgroundColor: 'rgba(239,68,68,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg style={{ width: 20, height: 20, color: '#f87171' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">确认删除</h3>
                  <p className="text-sm text-slate-400 mt-0.5">此操作不可撤销</p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-slate-900/60 rounded-xl p-4 mb-5 border border-slate-700/50">
                <p className="text-sm text-slate-300">
                  确定要删除动态 <span style={{ color: '#f87171', fontWeight: 600 }}>「{confirmTarget.title.slice(0, 30)}{confirmTarget.title.length > 30 ? '…' : ''}」</span> 吗？
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button type="button" onClick={() => setConfirmTarget(null)} className="btn btn-secondary flex-1 justify-center py-2.5">取消</button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn flex-1 justify-center py-2.5"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.85)', color: '#ffffff',
                  border: '1px solid rgba(239,68,68,0.5)', fontWeight: 600,
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500 mt-3">加载中…</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <svg className="w-12 h-12 mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm text-slate-500">
            {total === 0 ? '暂无动态，请先启用信息源并抓取' : '没有符合条件的动态'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {articles.map(article => (
              <div key={article.id} className="card p-4 hover:shadow-lg transition-all" style={{ transition: 'box-shadow 200ms, border-color 200ms' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: 11, display: 'inline-flex', alignItems: 'center', borderRadius: 9999, padding: '2px 9px', fontWeight: 500 }}>
                        {article.sourceName}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(article.publishedAt)}</span>
                      {article.tags.map(t => (
                        <span key={t} style={{ backgroundColor: 'rgba(100,116,139,0.2)', color: '#94a3b8', fontSize: 11, display: 'inline-flex', alignItems: 'center', borderRadius: 9999, padding: '2px 9px', fontWeight: 500 }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <a
                      href={article.url}
                      target="_blank" rel="noopener noreferrer"
                      className="text-base font-semibold text-slate-200 hover:text-blue-400 hover:underline block leading-snug mb-1.5"
                    >
                      {article.title}
                    </a>
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">{article.summary}</p>
                  </div>
                  {/* 收藏按钮 */}
                  {isFavourited(article.id) ? (
                    <button
                      type="button"
                      onClick={() => handleToggleFavourite(article)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12, padding: '4px 10px', borderRadius: 8,
                        backgroundColor: 'rgba(236,72,153,0.15)', color: '#f472b6',
                        border: '1px solid rgba(236,72,153,0.35)', cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      取消收藏
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleFavourite(article)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12, padding: '4px 10px', borderRadius: 8,
                        backgroundColor: 'rgba(236,72,153,0.1)', color: '#94a3b8',
                        border: '1px solid rgba(236,72,153,0.2)', cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(236,72,153,0.15)';
                        (e.target as HTMLButtonElement).style.color = '#f472b6';
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(236,72,153,0.1)';
                        (e.target as HTMLButtonElement).style.color = '#94a3b8';
                      }}
                    >
                      收藏
                    </button>
                  )}
                  {/* 删除按钮：type=button + 自定义确认弹窗 */}
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(article)}
                    style={{
                      flexShrink: 0,
                      fontSize: 12, padding: '4px 10px', borderRadius: 8,
                      backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          {renderPagination()}
        </>
      )}
    </div>
  );
}
