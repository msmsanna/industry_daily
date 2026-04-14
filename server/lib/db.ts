/**
 * 数据库抽象层
 * 本地开发：SQLite (sql.js)
 * 生产环境：Supabase PostgreSQL
 *
 * 使用方式：
 *   import { db } from './db';
 *   const articles = await db.getArticles({ page: 1, pageSize: 20 });
 */

// ============================================
// 类型定义
// ============================================

export interface Article {
  id: string;
  source_id: string;
  source_name: string;
  title: string;
  summary?: string;
  url: string;
  content?: string;
  published_at: string; // ISO string
  fetched_at: string;    // ISO string
  tags?: string[];       // JSON array
}

export interface GetArticlesOptions {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  mode?: 'fuzzy' | 'exact';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 数据库操作接口（两种实现都遵循此接口）
export interface Database {
  // 新闻 CRUD
  getArticles(options?: GetArticlesOptions): Promise<PaginatedResult<Article>>;
  getAllArticles(options?: Omit<GetArticlesOptions, 'page' | 'pageSize'>): Promise<{ articles: Article[]; totalFiltered: number }>;
  addArticles(articles: Article[]): Promise<{ inserted: number; skipped: number }>;
  deleteArticle(id: string): Promise<void>;
  cleanupOlderThan(days: number): Promise<number>;

  // 健康检查
  health(): Promise<boolean>;
}

// ============================================
// SQLite 实现（本地开发）
// ============================================

class SQLiteDatabase implements Database {
  private db: any = null;
  private initialized = false;

  async init(dbPath?: string) {
    if (this.initialized) return;

    const path = require('path');
    const fs = require('fs');
    const DB_PATH = dbPath || process.env.DB_PATH ||
      path.join(process.cwd(), '..', 'server', 'data', 'news.db');

    // 确保 data 目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(fileBuffer);
        console.log(`[SQLite] 已加载已有数据库: ${DB_PATH}`);
      } else {
        this.db = new SQL.Database();
        console.log(`[SQLite] 创建新数据库`);
      }

      // 创建表和索引
      this.db.run(`
        CREATE TABLE IF NOT EXISTS news (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT,
          url TEXT NOT NULL UNIQUE,
          content TEXT,
          published_at TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          tags TEXT
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_news_source_id ON news(source_id)');

      // 定期保存
      setInterval(() => this.saveToFile(), 30000);

      this.initialized = true;
      console.log('[SQLite] 初始化完成');
    } catch (e) {
      console.error('[SQLite] 初始化失败:', e);
      throw e;
    }
  }

  saveToFile() {
    if (!this.db) return;
    try {
      const path = require('path');
      const fs = require('fs');
      const DB_PATH = process.env.DB_PATH ||
        path.join(process.cwd(), '..', 'server', 'data', 'news.db');
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('[SQLite] 保存失败:', e);
    }
  }

  private ensureInit() {
    if (!this.initialized) {
      throw new Error('数据库未初始化，请先调用 init()');
    }
  }

  buildWhereClause(options: GetArticlesOptions) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.dateFrom) {
      conditions.push('published_at >= ?');
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      conditions.push('published_at <= ?');
      params.push(options.dateTo + 'T23:59:59.999Z');
    }
    if (options.keyword && options.keyword.trim()) {
      const kw = options.keyword.trim();
      if (options.mode === 'exact') {
        const keywords = kw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        for (const k of keywords) {
          params.push(`%${k}%`, `%${k}%`, `%${k}%`);
          conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
        }
      } else {
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
        conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      }
    }

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  async getArticles(options: GetArticlesOptions = {}): Promise<PaginatedResult<Article>> {
    this.ensureInit();
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const { whereClause, params } = this.buildWhereClause(options);

    // 查询总数
    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM news ${whereClause}`);
    if (params.length > 0) countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().total || 0;
    countStmt.free();

    // 分页查询
    const offset = (page - 1) * pageSize;
    const dataStmt = this.db.prepare(`
      SELECT id, source_id as sourceId, source_name as sourceName, title, summary,
             url, content, published_at as publishedAt, fetched_at as fetchedAt, tags
      FROM news ${whereClause}
      ORDER BY published_at DESC LIMIT ? OFFSET ?
    `);
    dataStmt.bind([...params, pageSize, offset]);

    const articles: Article[] = [];
    while (dataStmt.step()) {
      articles.push(this.parseRow(dataStmt.getAsObject()));
    }
    dataStmt.free();

    return {
      data: articles,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getAllArticles(
    options: Omit<GetArticlesOptions, 'page' | 'pageSize'> = {}
  ): Promise<{ articles: Article[]; totalFiltered: number }> {
    this.ensureInit();
    const MAX_ARTICLES = 100;
    const { whereClause, params } = this.buildWhereClause(options);

    const stmt = this.db.prepare(`
      SELECT id, source_id as sourceId, source_name as sourceName, title, summary,
             url, content, published_at as publishedAt, fetched_at as fetchedAt, tags
      FROM news ${whereClause}
      ORDER BY published_at DESC LIMIT ?
    `);
    stmt.bind([...params, MAX_ARTICLES]);

    const articles: Article[] = [];
    while (stmt.step()) {
      articles.push(this.parseRow(stmt.getAsObject()));
    }
    stmt.free();

    // 总数（不含 LIMIT）
    const totalStmt = this.db.prepare(`SELECT COUNT(*) as total FROM news ${whereClause}`);
    if (params.length > 0) totalStmt.bind(params);
    totalStmt.step();
    const totalFiltered = totalStmt.getAsObject().total || 0;
    totalStmt.free();

    return { articles, totalFiltered };
  }

  async addArticles(articles: Article[]): Promise<{ inserted: number; skipped: number }> {
    this.ensureInit();
    let inserted = 0, skipped = 0;

    for (const article of articles) {
      try {
        this.db.run(`
          INSERT OR IGNORE INTO news (id, source_id, source_name, title, summary, url, content, published_at, fetched_at, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          article.id, article.source_id, article.source_name, article.title,
          article.summary || '', article.url, article.content || '',
          article.published_at, article.fetched_at,
          Array.isArray(article.tags) ? JSON.stringify(article.tags) : '[]',
        ]);
        if (this.db.getRowsModified() > 0) inserted++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    this.saveToFile();
    return { inserted, skipped };
  }

  async deleteArticle(id: string): Promise<void> {
    this.ensureInit();
    this.db.run('DELETE FROM news WHERE id = ?', [id]);
    this.saveToFile();
  }

  async cleanupOlderThan(days: number): Promise<number> {
    this.ensureInit();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    this.db.run('DELETE FROM news WHERE published_at < ?', [cutoff.toISOString()]);
    this.saveToFile();
    return this.db.getRowsModified() || 0;
  }

  async health(): Promise<boolean> {
    try {
      if (!this.db) return false;
      const stmt = this.db.prepare('SELECT 1');
      stmt.step();
      stmt.free();
      return true;
    } catch {
      return false;
    }
  }

  private parseRow(row: any): Article {
    let tags: string[] = [];
    try { tags = row.tags ? JSON.parse(row.tags) : []; } catch { tags = []; }
    return {
      id: row.id,
      source_id: row.sourceId,
      source_name: row.sourceName,
      title: row.title,
      summary: row.summary || '',
      url: row.url,
      content: row.content || '',
      published_at: row.publishedAt,
      fetched_at: row.fetchedAt,
      tags,
    };
  }
}

// ============================================
// Supabase 实现（生产环境）
// ============================================

class SupabaseDatabase implements Database {
  private client: any = null;
  private initialized = false;

  async init(supabaseUrl?: string, serviceRoleKey?: string) {
    if (this.initialized) return;

    const url = supabaseUrl || process.env.SUPABASE_URL || '';
    const key = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !key) {
      throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量');
    }

    try {
      // 动态导入 @supabase/supabase-js
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(url, key);
      this.initialized = true;
      console.log('[Supabase] 连接成功');
    } catch (e) {
      console.error('[Supabase] 初始化失败:', e);
      throw e;
    }
  }

  private ensureInit() {
    if (!this.initialized) {
      throw new Error('数据库未初始化，请先调用 init()');
    }
  }

  private buildFilterQuery(options: GetArticlesOptions) {
    let query = this.client.from('news').select('*', { count: 'exact' });

    if (options.dateFrom) {
      query = query.gte('published_at', options.dateFrom);
    }
    if (options.dateTo) {
      query = query.lte('published_at', options.dateTo + 'T23:59:59.999Z');
    }
    if (options.keyword && options.keyword.trim()) {
      const kw = options.keyword.trim();
      if (options.mode === 'exact') {
        const keywords = kw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        query = query.or(keywords.map(k =>
          `title.ilike.%${k}%,summary.ilike.%${k}%,content.ilike.%${k}%`
        ).join(','));
      } else {
        query = query.or(`title.ilike.%${kw}%,summary.ilike.%${kw}%,content.ilike.%${kw}%`);
      }
    }

    return query;
  }

  async getArticles(options: GetArticlesOptions = {}): Promise<PaginatedResult<Article>> {
    this.ensureInit();
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));

    let query = this.buildFilterQuery(options);
    const { data, count, error } = await query
      .order('published_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    return {
      data: (data || []).map(this.transformRow),
      pagination: { page, pageSize, total: count || 0, totalPages: Math.ceil((count || 0) / pageSize) },
    };
  }

  async getAllArticles(
    options: Omit<GetArticlesOptions, 'page' | 'pageSize'> = {}
  ): Promise<{ articles: Article[]; totalFiltered: number }> {
    this.ensureInit();

    let query = this.buildFilterQuery(options);
    const { data, count, error } = await query
      .order('published_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return {
      articles: (data || []).map(this.transformRow),
      totalFiltered: count || 0,
    };
  }

  async addArticles(articles: Article[]): Promise<{ inserted: number; skipped: number }> {
    this.ensureInit();

    const rows = articles.map(a => ({
      id: a.id,
      source_id: a.source_id,
      source_name: a.source_name,
      title: a.title,
      summary: a.summary || '',
      url: a.url,
      content: a.content || '',
      published_at: a.published_at,
      fetched_at: a.fetched_at,
      tags: Array.isArray(a.tags) ? a.tags : [],
    }));

    const { data, error, statusText } = await this.client.from('news')
      .upsert(rows, { onConflict: 'url' });

    if (error) throw error;

    // Supabase upsert 不区分 insert/skip，用长度估算
    return { inserted: rows.length, skipped: 0 };
  }

  async deleteArticle(id: string): Promise<void> {
    this.ensureInit();
    const { error } = await this.client.from('news').delete().eq('id', id);
    if (error) throw error;
  }

  async cleanupOlderThan(days: number): Promise<number> {
    this.ensureInit();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const { count, error } = await this.client.from('news')
      .delete()
      .lt('published_at', cutoff.toISOString());
    if (error) throw error;
    return count || 0;
  }

  async health(): Promise<boolean> {
    try {
      const { error } = await this.client.from('news').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  private transformRow(row: any): Article {
    return {
      id: row.id,
      source_id: row.source_id,
      source_name: row.source_name,
      title: row.title,
      summary: row.summary || '',
      url: row.url,
      content: row.content || '',
      published_at: row.published_at,
      fetched_at: row.fetched_at,
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
  }
}

// ============================================
// 工厂函数：根据环境自动选择
// ============================================

let _instance: Database | null = null;

/**
 * 获取数据库实例（单例模式）
 * 自动根据 USE_LOCAL_DB 环境变量选择 SQLite 或 Supabase
 */
export async function createDatabase(dbPath?: string): Promise<Database> {
  if (_instance) return _instance;

  const useLocalDb = process.env.USE_LOCAL_DB !== 'false'; // 默认 true

  if (useLocalDb) {
    const sqlite = new SQLiteDatabase();
    await sqlite.init(dbPath);
    _instance = sqlite;
  } else {
    const supabase = new SupabaseDatabase();
    await supabase.init();
    _instance = supabase;
  }

  return _instance;
}

/**
 * 重置单例（用于测试或重新初始化）
 */
export function resetDatabaseInstance(): void {
  _instance = null;
}

/** 导出类供直接使用（如 server/index.js） */
export { SQLiteDatabase, SupabaseDatabase };
