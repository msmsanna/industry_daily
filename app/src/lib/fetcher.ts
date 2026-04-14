import type { Source, Article } from '../types';
import { updateSource } from './storage';
import { getApiBaseUrl } from './config';

// ============================================================
// 新闻 API（与后端 SQLite 数据库交互）
// ============================================================

export interface NewsQueryParams {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  mode?: 'fuzzy' | 'exact';
}

export interface NewsListResponse {
  success: boolean;
  data: Article[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface NewsAllResponse {
  success: boolean;
  data: Article[];
  total: number;        // 本次返回的实际条数（最多100条）
  totalFiltered: number; // 满足筛选条件的总条数
  truncated: boolean;    // 是否超过上限被截断
  maxLimit: number;     // 最大限制数（100）
}

/**
 * 获取新闻列表（分页）
 */
export async function fetchNewsList(params: NewsQueryParams): Promise<NewsListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.mode) query.set('mode', params.mode);

  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/news?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`获取新闻列表失败: ${res.status}`);
  }
  return res.json();
}

/**
 * 获取全部筛选结果（不分页，用于日报生成）
 */
export async function fetchAllNews(params: Omit<NewsQueryParams, 'page' | 'pageSize'>): Promise<NewsAllResponse> {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.mode) query.set('mode', params.mode);

  const res = await fetch(`${apiBase}/news/all?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`获取全部新闻失败: ${res.status}`);
  }
  return res.json();
}

/**
 * 批量添加新闻（自动去重）
 */
export async function addNews(articles: Article[]): Promise<{ inserted: number; skipped: number }> {
  const res = await fetch(`${apiBase}/news`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles }),
  });
  if (!res.ok) {
    throw new Error(`添加新闻失败: ${res.status}`);
  }
  const data = await res.json();
  return { inserted: data.inserted, skipped: data.skipped };
}

/**
 * 删除单条新闻
 */
export async function deleteNews(id: string): Promise<void> {
  const res = await fetch(`${apiBase}/news/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`删除新闻失败: ${res.status}`);
  }
}

/**
 * 清理过期新闻
 */
export async function cleanupNews(days: number = 180): Promise<{ deleted: number }> {
  const res = await fetch(`${apiBase}/news/cleanup?days=${days}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`清理新闻失败: ${res.status}`);
  }
  const data = await res.json();
  return { deleted: data.deleted };
}

// ============================================================
// RSS 抓取相关（支持标准 RSS/Atom + WeWe-RSS 本地服务）
// ============================================================

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// 只保留最近3天的文章
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 直接解析 Atom/XML RSS 文本（支持 WeWe-RSS 等本地源）
 */
function parseAtomFeed(xmlText: string, source: Source): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML 解析失败');

  const entries = doc.querySelectorAll('entry');
  if (entries.length === 0) throw new Error('Atom Feed 中没有找到任何文章');

  const now = new Date().toISOString();
  const cutoffTime = new Date(Date.now() - THREE_DAYS_MS).getTime();

  const articles: Article[] = [];

  entries.forEach(entry => {
    const titleEl = entry.querySelector('title');
    const linkEl = entry.querySelector('link[href]');
    const updatedEl = entry.querySelector('updated') || entry.querySelector('published');
    const summaryEl = entry.querySelector('summary') || entry.querySelector('content');

    const title = titleEl ? stripHtml(titleEl.textContent || '') : '无标题';
    const link = linkEl ? (linkEl.getAttribute('href') || '') : '';
    const rawDesc = summaryEl ? (summaryEl.textContent || '') : '';
    const cleanDesc = stripHtml(rawDesc);

    let publishedAt = now;
    if (updatedEl?.textContent) {
      try { publishedAt = new Date(updatedEl.textContent).toISOString(); } catch { /* use now */ }
    }

    articles.push({
      id: generateId(),
      sourceId: source.id,
      sourceName: source.name,
      title,
      summary: truncate(cleanDesc, 200),
      url: link,
      content: cleanDesc,
      publishedAt,
      fetchedAt: now,
      tags: source.tags,
    });
  });

  // 过滤只保留最近3天的
  return articles.filter(a => {
    try { return new Date(a.publishedAt).getTime() >= cutoffTime; }
    catch { return true; }
  });
}

/**
 * 判断是否为可直接访问的URL（localhost / 内网 / 已知格式）
 */
function isDirectFetchable(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1')
    || url.includes('wewe-rss') || url.endsWith('.atom');
}

/**
 * 验证单个 RSS/Atom URL 是否有效（同时返回可用条数）
 */
export async function validateRSSUrl(url: string): Promise<{ valid: boolean; message: string; count?: number }> {
  try {
    let itemCount = 0;

    if (isDirectFetchable(url)) {
      // 直接请求 Atom/RSS 源（支持 localhost）
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML 格式无效');
      itemCount = doc.querySelectorAll('entry').length || doc.querySelectorAll('item').length;
      if (itemCount === 0) throw new Error('Feed 内容为空');
    } else {
      // 外部 URL：尝试直接 fetch
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/rss+xml,application/atom+xml,text/xml,*/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('xml') || text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<feed') || text.trimStart().startsWith('<rss')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('XML 解析失败');
        itemCount = doc.querySelectorAll('entry').length || doc.querySelectorAll('item').length;
      } else {
        throw new Error('不是有效的 RSS/Atom Feed');
      }

      if (itemCount === 0) throw new Error('Feed 中没有文章');
    }

    return { valid: true, message: `可用（${itemCount} 条）`, count: itemCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return { valid: false, message: `无法访问：${msg}` };
  }
}

/**
 * 抓取单个信息源的 RSS/Atom 文章列表
 */
export async function fetchRSS(source: Source): Promise<Article[]> {
  const url = source.url;

  if (isDirectFetchable(url) || true) {
    // 统一使用直接解析方式
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`请求失败: HTTP ${res.status}`);
    const xmlText = await res.text();
    return parseAtomFeed(xmlText, source);
  }

  // 兜底：不应该走到这里，但保留以防万一
  throw new Error(`不支持的 RSS 源格式: ${url}`);
}

/**
 * 抓取所有启用的信息源（用于定时任务）
 */
export async function fetchAllActiveSources(
  sources: Source[],
  onProgress?: (done: number, total: number, name: string) => void
): Promise<{ success: number; failed: number; total: number }> {
  const active = sources.filter(s => s.status === 'active');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < active.length; i++) {
    const src = active[i];
    onProgress?.(i, active.length, src.name);
    try {
      const articles = await fetchRSS(src);
      if (articles.length > 0) {
        await addNews(articles);
      }
      updateSource({ ...src, lastFetchedAt: new Date().toISOString() });
      success++;
    } catch (e) {
      console.error(`抓取失败 [${src.name}]:`, e);
      failed++;
    }
  }

  onProgress?.(active.length, active.length, '');
  return { success, failed, total: active.length };
}

// ============================================================
// 日报生成 API
// ============================================================

interface GenerateResponse {
  success: boolean;
  content?: string;
  model?: string;
  error?: string;
}

/**
 * 调用后端 AI 生成日报
 */
export async function generateReport(articles: { title: string; content: string }[], dateRange: string): Promise<string> {
  const res = await fetch(`${apiBase}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles, dateRange }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let errorMsg = '';
    try {
      const errJson = JSON.parse(errorBody);
      errorMsg = errJson.error || errorBody;
    } catch {
      errorMsg = errorBody;
    }
    throw new Error(`后端返回错误 (${res.status}): ${errorMsg}`);
  }

  const data: GenerateResponse = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'AI 生成失败');
  }

  return data.content || '';
}
