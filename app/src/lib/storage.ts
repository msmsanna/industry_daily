import type { Source, Article, Report } from '../types';

const KEYS = {
  sources: 'industry_sources',
  articles: 'industry_articles',
  reports: 'industry_reports',
  auth: 'industry_auth',
  lastFetch: 'industry_last_fetch',
  favourites: 'industry_favourites',
};

// 自动清理超过3个月的动态
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Auth
export const isLoggedIn = (): boolean => get<boolean>(KEYS.auth, false);
export const login = (user: string, pass: string): boolean => {
  if (user === 'admin' && pass === '123456') {
    set(KEYS.auth, true);
    return true;
  }
  return false;
};
export const logout = (): void => set(KEYS.auth, false);

// Sources
export const getSources = (): Source[] => get<Source[]>(KEYS.sources, []);
export const saveSources = (sources: Source[]): void => set(KEYS.sources, sources);
export const addSource = (source: Source): void => {
  const list = getSources();
  list.push(source);
  saveSources(list);
};
export const updateSource = (updated: Source): void => {
  saveSources(getSources().map(s => s.id === updated.id ? updated : s));
};
export const deleteSource = (id: string): number => {
  saveSources(getSources().filter(s => s.id !== id));
  // 同时删除该信息源下的所有历史动态
  const remaining = getArticles().filter(a => a.sourceId !== id);
  const removedCount = getArticles().length - remaining.length;
  saveArticles(remaining);
  return removedCount;
};

// Articles（带3个月自动清理）
export const getArticles = (): Article[] => {
  const articles = get<Article[]>(KEYS.articles, []);
  const cutoff = Date.now() - THREE_MONTHS_MS;
  return articles.filter(a => {
    try {
      return new Date(a.publishedAt).getTime() > cutoff;
    } catch {
      return true;
    }
  });
};
export const saveArticles = (articles: Article[]): void => set(KEYS.articles, articles);
export const addArticles = (newItems: Article[]): void => {
  const existing = getArticles();
  const urls = new Set(existing.map(a => a.url));
  const toAdd = newItems.filter(a => !urls.has(a.url));
  saveArticles([...toAdd, ...existing]);
};
export const deleteArticle = (id: string): void => {
  saveArticles(getArticles().filter(a => a.id !== id));
};

// Reports
export const getReports = (): Report[] => get<Report[]>(KEYS.reports, []);
export const saveReports = (reports: Report[]): void => set(KEYS.reports, reports);
export const addReport = (report: Report): void => {
  const list = getReports();
  list.unshift(report);
  saveReports(list);
};
export const updateReport = (updated: Report): void => {
  saveReports(getReports().map(r => r.id === updated.id ? updated : r));
};
export const deleteReport = (id: string): void => {
  saveReports(getReports().filter(r => r.id !== id));
};

// Last fetch time
export const getLastFetch = (): number => get<number>(KEYS.lastFetch, 0);
export const setLastFetch = (ts: number): void => set(KEYS.lastFetch, ts);

// Favourites
export const getFavourites = (): Article[] => get<Article[]>(KEYS.favourites, []);
export const saveFavourites = (favourites: Article[]): void => set(KEYS.favourites, favourites);

export const addFavourite = (article: Article): void => {
  const list = getFavourites();
  // 避免重复收藏
  if (!list.some(a => a.id === article.id)) {
    list.unshift(article);
    saveFavourites(list);
  }
};

export const removeFavourite = (id: string): void => {
  saveFavourites(getFavourites().filter(a => a.id !== id));
};

export const isFavourited = (id: string): boolean => {
  return getFavourites().some(a => a.id === id);
};
