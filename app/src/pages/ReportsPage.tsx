import { useState, useEffect, useCallback } from 'react';
import type { Report, Article } from '../types';
import { getReports, deleteReport, updateReport, addReport } from '../lib/storage';
import { generateReportWithAI } from '../lib/reportGen';
import { fetchAllNews } from '../lib/fetcher';
import { format } from 'date-fns';

const today = format(new Date(), 'yyyy-MM-dd');

// 统一的主按钮样式
const primaryBtnClass = 'btn btn-primary';

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 筛选条件
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [keywords, setKeywords] = useState('');
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact'>('fuzzy');

  // 生成相关状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressStep, setProgressStep] = useState<string>('');       // 当前步骤
  const [progressDetail, setProgressDetail] = useState<string>('');   // 步骤详情
  const [filteredCount, setFilteredCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(false);
  const [truncated, setTruncated] = useState(false);

  // 自定义删除确认弹窗
  const [confirmTarget, setConfirmTarget] = useState<{ id: string } | null>(null);

  useEffect(() => { setReports(getReports()); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // 获取筛选后的动态数量
  const loadFilteredCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const response = await fetchAllNews({
        dateFrom,
        dateTo,
        keyword: keywords,
        mode: searchMode,
      });
      setFilteredCount(response.total);
    } catch (err) {
      console.error('获取动态数量失败:', err);
      setFilteredCount(0);
    } finally {
      setLoadingCount(false);
    }
  }, [dateFrom, dateTo, keywords, searchMode]);

  useEffect(() => {
    loadFilteredCount();
  }, [loadFilteredCount]);

  // 生成日报
  const handleGenerate = async () => {
    if (filteredCount === 0) {
      setStatusMsg('没有找到符合条件的动态，请调整筛选条件');
      return;
    }

    setIsGenerating(true);
    setStatusMsg(`正在处理 ${filteredCount} 条动态，请稍候...`);
    setProgressStep('');
    setProgressDetail('');
    setPreviewReport(null);

    try {
      // 从后端获取全部筛选结果（最多100条）
      const response = await fetchAllNews({
        dateFrom,
        dateTo,
        keyword: keywords,
        mode: searchMode,
      });

      if (response.data.length === 0) {
        setStatusMsg('没有找到符合条件的动态');
        return;
      }

      // 记录是否被截断（超过100条）
      setTruncated(response.truncated || false);

      const dateRange = dateFrom === dateTo
        ? `${dateFrom.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}`
        : `${dateFrom} 至 ${dateTo}`;

      const truncatedNote = response.truncated
        ? `\n（注意：当前匹配 ${response.totalFiltered} 条动态，系统仅取最新 100 条生成日报。）`
        : '';

      const result = await generateReportWithAI(response.data, dateFrom, truncatedNote, (step, detail) => {
        setProgressStep(step);
        if (detail) setProgressDetail(detail);
      });

      if (result.success && result.report) {
        setPreviewReport(result.report);
        setStatusMsg('');
      } else {
        setStatusMsg(`生成失败：${result.error || '未知错误'}`);
      }
    } catch (error) {
      setStatusMsg(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
      setProgressStep('');
      setProgressDetail('');
    }
  };

  const handleSaveReport = () => {
    if (!previewReport) return;
    addReport(previewReport);
    setReports(getReports());
    setShowEditor(false);
    setPreviewReport(null);
    setStatusMsg('');
    showToast('日报已保存');
  };

  const handleOpenEdit = (report: Report) => {
    setEditingReport(report);
    setEditContent(report.fullContent);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingReport) return;
    updateReport({ ...editingReport, fullContent: editContent });
    setReports(getReports());
    setShowEditModal(false);
    showToast('日报已更新');
  };

  const handleDeleteClick = (id: string) => {
    setConfirmTarget({ id });
  };

  const confirmDelete = () => {
    if (!confirmTarget) return;
    deleteReport(confirmTarget.id);
    setReports(getReports());
    setConfirmTarget(null);
    showToast('日报已删除');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const renderReport = (text: string) => {
    const lines = text.split('\n');
    const html: string[] = [];
    for (const line of lines) {
      if (!line.trim()) { html.push('<div class="h-2"></div>'); }
      else if (line.startsWith('---')) { html.push('<hr style="border-color:#334155;margin:8px 0" />'); }
      else if (line.startsWith('📰') || line.startsWith('【')) {
        html.push(`<div style="color:#e2e8f0;font-weight:600;font-size:15px;margin-top:12px">${line}</div>`);
      }
      else if (line.startsWith('•')) {
        const content = line.slice(1).trim();
        const colonIdx = content.indexOf('：');
        if (colonIdx > 0) {
          const title = content.slice(0, colonIdx);
          const desc = content.slice(colonIdx + 1);
          html.push(`<div style="margin:6px 0;padding:8px 12px;background:rgba(30,41,59,0.5);border-radius:8px;border-left:3px solid #6366f1">
            <span style="color:#a5b4fc;font-weight:500">${title}</span>
            <span style="color:#94a3b8;margin-left:6px">${desc}</span>
          </div>`);
        } else {
          html.push(`<div style="color:#94a3b8;margin:4px 0">${line}</div>`);
        }
      }
      else {
        html.push(`<div style="color:#cbd5e1;margin:3px 0">${line}</div>`);
      }
    }
    return html.join('');
  };

  const openEditor = () => {
    setShowEditor(true);
    setPreviewReport(null);
    setStatusMsg('');
    setKeywords('');
    setDateFrom(today);
    setDateTo(today);
    setSearchMode('fuzzy');
    // 刷新筛选数量
    loadFilteredCount();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: '#6366f1', color: 'white', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
          {toast}
        </div>
      )}

      {/* 自定义删除确认弹窗 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-slate-100 mb-2">确认删除</h3>
            <p className="text-sm text-slate-400 mb-5">确定要删除这份日报吗？此操作无法撤销。</p>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmTarget(null)}>取消</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEditModal && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #334155' }}>
              <h3 className="text-base font-semibold text-slate-100">编辑日报</h3>
              <button type="button" onClick={() => setShowEditModal(false)}
                className="btn btn-ghost p-1.5 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                className="w-full h-96 p-4 rounded-xl text-sm"
                style={{ backgroundColor: 'rgba(15,23,42,0.8)', border: '1px solid #334155', color: '#e2e8f0', resize: 'vertical' }}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid #334155' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>取消</button>
              <button type="button" className={primaryBtnClass} onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 页面头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">日报生成</h2>
          <p className="text-sm text-slate-400 mt-0.5">根据行业动态自动生成每日行业报告</p>
        </div>
        <button type="button" className={primaryBtnClass} onClick={openEditor}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          生成新日报
        </button>
      </div>

      {/* 日报列表 */}
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-12 h-12 mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-slate-500">暂无日报，点击「生成新日报」开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="rounded-2xl p-5" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-100 truncate">{report.title}</h3>
                  <p className="text-sm text-slate-400 mb-2">
                    生成于 {new Date(report.createdAt).toLocaleString('zh-CN')}
                    {' · '}{report.categories.reduce((s, c) => s + c.articles.length, 0)} 条重要资讯
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button type="button" onClick={() => handleCopy(report.id, report.fullContent)}
                    className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                    {copiedId === report.id ? '已复制!' : '复制'}
                  </button>
                  <button type="button" onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                    className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                    {expandedId === report.id ? '收起' : '展开'}
                  </button>
                  <button type="button" onClick={() => handleOpenEdit(report)}
                    className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                    编辑
                  </button>
                  <button type="button" onClick={() => handleDeleteClick(report.id)}
                    className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: '#f87171' }}>
                    删除
                  </button>
                </div>
              </div>

              {expandedId === report.id && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid #334155', backgroundColor: 'rgba(15,23,42,0.5)', borderRadius: 10, padding: '16px' }}
                  dangerouslySetInnerHTML={{ __html: renderReport(report.fullContent) }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 生成日报弹窗 */}
      {showEditor && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: previewReport ? '1px solid #334155' : 'none' }}>
              <h3 className="text-base font-semibold text-slate-100">生成日报</h3>
              <button type="button" onClick={() => { setShowEditor(false); setPreviewReport(null); setStatusMsg(''); }}
                className="btn btn-ghost p-1.5 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 筛选条件 */}
            <div className="px-6 py-4 space-y-4" style={{ borderBottom: previewReport ? '1px solid #334155' : 'none' }}>
              {/* 日期范围 */}
              <div className="flex items-center gap-4">
                <label className="text-sm text-slate-300 whitespace-nowrap">日期范围：</label>
                <input className="input" type="date" value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
                <span className="text-slate-500">至</span>
                <input className="input" type="date" value={dateTo}
                  onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
              </div>

              {/* 关键词筛选 */}
              <div className="flex items-center gap-4">
                <label className="text-sm text-slate-300 whitespace-nowrap">关键词：</label>
                <input className="input flex-1" type="text"
                  placeholder="多个关键词用逗号分隔，如：固态电池, 融资"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)} />
                <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
                  <input type="radio" checked={searchMode === 'fuzzy'} onChange={() => setSearchMode('fuzzy')} className="accent-indigo-500" />
                  模糊
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
                  <input type="radio" checked={searchMode === 'exact'} onChange={() => setSearchMode('exact')} className="accent-indigo-500" />
                  精确
                </label>
              </div>

              {/* 匹配数量 + 生成按钮 */}
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  {loadingCount ? (
                    <span className="text-slate-400">正在加载…</span>
                  ) : filteredCount > 0 ? (
                    <span style={{ color: '#4ade80' }}>共匹配 <strong>{filteredCount}</strong> 条动态</span>
                  ) : (
                    <span style={{ color: '#f87171' }}>没有匹配的动态</span>
                  )}
                </p>
                <button
                  type="button"
                  className={primaryBtnClass}
                  onClick={handleGenerate}
                  disabled={isGenerating || filteredCount === 0 || loadingCount}
                  style={{ opacity: (isGenerating || filteredCount === 0 || loadingCount) ? 0.5 : 1 }}
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: 6 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      生成中...
                    </>
                  ) : '生成日报'}
                </button>
              </div>

              {/* 状态消息 + 进度条 */}
              {statusMsg && (
                <div>
                  {/* 进度条（仅生成时显示） */}
                  {isGenerating && progressStep && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-indigo-400 font-medium">
                          {{
                            preprocess: '📊 数据预处理',
                            ai_classify: '🤖 AI 分类分析',
                            ai_summarize: '✍️ AI 整合撰写',
                            parsing: '📝 生成日报',
                          }[progressStep] || '⏳ 处理中'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: {
                              preprocess: '20%',
                              ai_classify: '50%',
                              ai_summarize: '80%',
                              parsing: '95%',
                            }[progressStep] || '10%',
                            backgroundColor: '#6366f1',
                            boxShadow: '0 0 8px rgba(99,102,241,0.4)',
                          }}
                        />
                      </div>
                      {progressDetail && (
                        <p className="text-xs text-slate-500 mt-1">{progressDetail}</p>
                      )}
                    </div>
                  )}
                  <p className="text-sm" style={{ color: statusMsg.includes('失败') ? '#f87171' : (isGenerating ? '#94a3b8' : '#cbd5e1') }}>
                    {statusMsg}
                  </p>
                </div>
              )}
            </div>

            {/* 预览区域 */}
            {previewReport && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-200 text-sm">日报预览</h4>
                  <button type="button" onClick={() => handleCopy(previewReport.id, previewReport.fullContent)}
                    className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}>
                    {copiedId === previewReport.id ? '已复制!' : '一键复制'}
                  </button>
                </div>
                <div
                  className="text-sm rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(15,23,42,0.6)', border: '1px solid #334155', color: '#cbd5e1', maxHeight: 400, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{ __html: renderReport(previewReport.fullContent) }}
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }}
                    onClick={() => { setPreviewReport(null); setStatusMsg(''); }}>
                    重新生成
                  </button>
                  <button type="button" className={primaryBtnClass} style={{ fontSize: 13 }} onClick={handleSaveReport}>
                    保存到日报列表
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
