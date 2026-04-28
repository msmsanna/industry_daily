import type { Source, Article } from '../types';
import { getApiBaseUrl } from './config';

const apiBase = getApiBaseUrl();

// ============================================================
// Sources API（与后端数据库交互）
// ============================================================

export interface SourceResponse {
  success: boolean;
  data: Source[];
}

/**
 * 获取所有信息源（从后端数据库）
 */
export async function fetchSources(): Promise<Source[]> {
  const res = await fetch(`${apiBase}/sources`);
  if (!res.ok) throw new Error(`获取信息源失败: ${res.status}`);
  const data: SourceResponse = await res.json();
  return data.data || [];
}

/**
 * 添加或更新信息源到后端
 */
export async function saveSource(source: Source): Promise<void> {
  const res = await fetch(`${apiBase}/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: source.id,
      name: source.name,
      url: source.url,
      type: source.type,
      description: source.description,
      tags: source.tags,
      status: source.status,
      createdAt: source.createdAt,
      lastFetchedAt: source.lastFetchedAt,
    }),
  });
  if (!res.ok) throw new Error(`保存信息源失败: ${res.status}`);
}

/**
 * 删除信息源
 */
export async function deleteSourceApi(id: string): Promise<void> {
  const res = await fetch(`${apiBase}/sources/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除信息源失败: ${res.status}`);
}

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

// 后端返回的新闻字段（snake_case）转换前端类型（camelCase）
function transformArticle(article: any): Article {
  return {
    id: article.id,
    sourceId: article.source_id,
    sourceName: article.source_name,
    title: article.title,
    summary: article.summary,
    url: article.url,
    content: article.content,
    publishedAt: article.published_at,
    fetchedAt: article.fetched_at,
    tags: Array.isArray(article.tags) ? article.tags : [],
  };
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

  const res = await fetch(`${apiBase}/news?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`获取新闻列表失败: ${res.status}`);
  }
  const data = await res.json();
  // 转换字段
  return {
    success: data.success,
    data: data.data?.map(transformArticle) || [],
    pagination: data.pagination,
  };
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
  const data = await res.json();
  // 转换字段
  return {
    success: data.success,
    data: data.data?.map(transformArticle) || [],
    total: data.total,
    totalFiltered: data.totalFiltered,
    truncated: data.truncated,
    maxLimit: data.maxLimit,
  };
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

// 只保留最近30天的文章（翻页时获取更多历史数据）
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
  const cutoffTime = new Date(Date.now() - THIRTY_DAYS_MS).getTime();

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
 * 构建带分页的 URL
 */
function buildPageUrl(baseUrl: string, page: number): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  // WeWe-RSS 分页参数：page=1, page=2, ...
  return `${baseUrl}${separator}page=${page}`;
}

/**
 * 抓取单个信息源的 RSS/Atom 文章列表（支持翻页）
 * @param source 信息源
 * @param maxPages 最大抓取页数，默认5页
 */
export async function fetchRSS(source: Source, maxPages: number = 5): Promise<Article[]> {
  const baseUrl = source.url;
  const allArticles: Article[] = [];
  let hasMore = true;
  let currentPage = 1;

  while (hasMore && currentPage <= maxPages) {
    const url = buildPageUrl(baseUrl, currentPage);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        // 如果是404或其他错误，可能没有更多页了
        if (res.status === 404 || res.status >= 500) {
          console.log(`[${source.name}] 页面 ${currentPage} 返回 ${res.status}，停止翻页`);
          break;
        }
        throw new Error(`请求失败: HTTP ${res.status}`);
      }

      const xmlText = await res.text();
      const articles = parseAtomFeed(xmlText, source);

      if (articles.length === 0) {
        // 没有内容了，停止翻页
        hasMore = false;
        console.log(`[${source.name}] 页面 ${currentPage} 无内容，停止翻页`);
      } else {
        allArticles.push(...articles);
        console.log(`[${source.name}] 页面 ${currentPage} 获取 ${articles.length} 条`);
        currentPage++;

        // 如果只有1页内容，说明可能不支持分页
        if (currentPage === 2 && articles.length < 10) {
          hasMore = false;
        }
      }
    } catch (e) {
      // 请求出错，可能是最后一页
      console.error(`[${source.name}] 页面 ${currentPage} 抓取失败:`, e);
      break;
    }
  }

  // 去除重复（根据 URL 去重）
  const seen = new Set<string>();
  const uniqueArticles = allArticles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`[${source.name}] 共抓取 ${uniqueArticles.length} 条（去重后）`);
  return uniqueArticles;
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
      // 通过后端 API 更新源的抓取时间
      await saveSource({ ...src, lastFetchedAt: new Date().toISOString() });
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
