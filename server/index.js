// 行业日报生成 - Node.js/Express 后端 + SQLite 数据库（sql.js）
// 启动：node index.js
// 需要 .env 文件，参考 .env.example

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// 数据库初始化（sql.js）
// ============================================================
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'news.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// sql.js 是异步初始化，需要等 initSQL 执行完
let db = null;

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // 尝试读取已有的数据库文件
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log(`[数据库] 已加载已有数据库: ${DB_PATH}`);
    } catch (e) {
      console.warn('[数据库] 加载失败，创建新数据库:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('[数据库] 创建新数据库');
  }

  // 创建表
  db.run(`
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_news_source_id ON news(source_id)`);

  console.log(`[数据库] SQLite 已初始化: ${DB_PATH}`);
}

// 保存数据库到文件
function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('[数据库] 保存失败:', e);
  }
}

// 定期自动保存（每 30 秒）
setInterval(saveDB, 30000);

// ============================================================
// 中间件
// ============================================================
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============================================================
// 健康检查接口
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: '行业日报生成服务运行中',
    model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    db: DB_PATH,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// 新闻 API
// ============================================================

/**
 * 获取新闻列表（分页 + 筛选）
 * GET /news?page=1&pageSize=20&dateFrom=&dateTo=&keyword=&mode=fuzzy
 */
app.get('/news', (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: '数据库未初始化' });

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const keyword = (req.query.keyword || '').trim();
    const mode = req.query.mode || 'fuzzy';

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];

    if (dateFrom) {
      conditions.push('published_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('published_at <= ?');
      params.push(dateTo + 'T23:59:59.999Z');
    }
    if (keyword) {
      if (mode === 'exact') {
        const keywords = keyword.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        const keywordConditions = keywords.map(k => {
          params.push(`%${k}%`, `%${k}%`, `%${k}%`);
          return '(title LIKE ? OR summary LIKE ? OR content LIKE ?)';
        });
        conditions.push(`(${keywordConditions.join(' AND ')})`);
      } else {
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM news ${whereClause}`);
    if (params.length > 0) countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().total || 0;
    countStmt.free();

    // 查询分页数据
    const offset = (page - 1) * pageSize;
    const dataStmt = db.prepare(`
      SELECT id, source_id as sourceId, source_name as sourceName, title, summary,
             url, content, published_at as publishedAt, fetched_at as fetchedAt, tags
      FROM news
      ${whereClause}
      ORDER BY published_at DESC
      LIMIT ? OFFSET ?
    `);
    const dataParams = [...params, pageSize, offset];
    dataStmt.bind(dataParams);

    const articles = [];
    while (dataStmt.step()) {
      const row = dataStmt.getAsObject();
      let parsedTags = [];
      try { parsedTags = row.tags ? JSON.parse(row.tags) : []; } catch { parsedTags = []; }
      articles.push({
        ...row,
        tags: parsedTags,
      });
    }
    dataStmt.free();

    res.json({
      success: true,
      data: articles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('查询新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 获取全部筛选结果（不分页，用于日报生成）
 * GET /news/all?dateFrom=&dateTo=&keyword=&mode=fuzzy
 * 最大返回 100 条最新动态，防止 LLM token 超限
 */
app.get('/news/all', (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: '数据库未初始化' });

  try {
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const keyword = (req.query.keyword || '').trim();
    const mode = req.query.mode || 'fuzzy';

    // 日报生成最大条数，防止 token 超限
    const MAX_ARTICLES = 100;

    const conditions = [];
    const params = [];

    if (dateFrom) {
      conditions.push('published_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('published_at <= ?');
      params.push(dateTo + 'T23:59:59.999Z');
    }
    if (keyword) {
      if (mode === 'exact') {
        const keywords = keyword.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        const keywordConditions = keywords.map(k => {
          params.push(`%${k}%`, `%${k}%`, `%${k}%`);
          return '(title LIKE ? OR summary LIKE ? OR content LIKE ?)';
        });
        conditions.push(`(${keywordConditions.join(' AND ')})`);
      } else {
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = db.prepare(`
      SELECT id, source_id as sourceId, source_name as sourceName, title, summary,
             url, content, published_at as publishedAt, fetched_at as fetchedAt, tags
      FROM news
      ${whereClause}
      ORDER BY published_at DESC
      LIMIT ?
    `);
    if (params.length > 0) stmt.bind([...params, MAX_ARTICLES]);
    else stmt.bind([MAX_ARTICLES]);

    const articles = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let parsedTags = [];
      try { parsedTags = row.tags ? JSON.parse(row.tags) : []; } catch { parsedTags = []; }
      articles.push({
        ...row,
        tags: parsedTags,
      });
    }
    stmt.free();

    // 查询满足筛选条件的总条数（不计 LIMIT），用于提示用户数据被截断
    const totalStmt = db.prepare(`SELECT COUNT(*) as total FROM news ${whereClause}`);
    if (params.length > 0) totalStmt.bind(params);
    totalStmt.step();
    const totalFiltered = totalStmt.getAsObject().total || 0;
    totalStmt.free();

    const truncated = totalFiltered > MAX_ARTICLES;

    res.json({
      success: true,
      data: articles,
      total: articles.length,
      totalFiltered,
      truncated,
      maxLimit: MAX_ARTICLES,
    });
  } catch (err) {
    console.error('查询全部新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 批量添加新闻（自动基于 URL 去重）
 * POST /news
 * Body: { articles: [...] }
 */
app.post('/news', (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: '数据库未初始化' });

  try {
    const { articles } = req.body;

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 articles 参数或为空数组' });
    }

    let inserted = 0;
    let skipped = 0;

    for (const article of articles) {
      const tags = Array.isArray(article.tags) ? JSON.stringify(article.tags) : '[]';
      try {
        db.run(`
          INSERT OR IGNORE INTO news (id, source_id, source_name, title, summary, url, content, published_at, fetched_at, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          article.id,
          article.sourceId || '',
          article.sourceName || '',
          article.title || '',
          article.summary || '',
          article.url || '',
          article.content || '',
          article.publishedAt || new Date().toISOString(),
          article.fetchedAt || new Date().toISOString(),
          tags,
        ]);
        if (db.getRowsModified() > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (e) {
        skipped++;
      }
    }

    // 保存到文件
    saveDB();

    res.json({
      success: true,
      inserted,
      skipped,
      message: `添加成功 ${inserted} 条，跳过重复 ${skipped} 条`,
    });
  } catch (err) {
    console.error('添加新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 删除单条新闻
 * DELETE /news/:id
 */
app.delete('/news/:id', (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: '数据库未初始化' });

  try {
    const { id } = req.params;
    db.run('DELETE FROM news WHERE id = ?', [id]);
    saveDB();

    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 清理过期新闻（超过指定天数）
 * DELETE /news/cleanup?days=180
 */
app.delete('/news/cleanup', (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: '数据库未初始化' });

  try {
    const days = parseInt(req.query.days) || 180;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    db.run('DELETE FROM news WHERE published_at < ?', [cutoffStr]);
    saveDB();

    res.json({
      success: true,
      deleted: db.getRowsModified(),
      message: `已清理 ${db.getRowsModified()} 条 ${days} 天前的新闻`,
    });
  } catch (err) {
    console.error('清理新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 日报生成接口（两步 LLM 调用）
// POST /generate
// Body: { articles: [{title, content}], dateRange: string }
// ============================================================
app.post('/generate', async (req, res) => {
  const { articles, dateRange } = req.body;

  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: '缺少 articles 参数，或 articles 为空数组' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 SILICONFLOW_API_KEY，请在 .env 文件中设置' });
  }

  const model = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct';

  try {
    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到请求：${articles.length} 条动态，日期：${dateRange}`);
    console.log('--- 第一步：分类 ---');

    // ====== 第一步：分类 ======
    const classifyPrompt = buildClassifyPrompt(articles);
    const classificationResult = await callAI([
      { role: 'system', content: '你是专业的行业信息分类员。输出纯文本，不要 Markdown 格式标记。' },
      { role: 'user', content: classifyPrompt },
    ], apiKey, model);

    console.log(`分类完成，结果长度：${classificationResult.length} 字`);
    console.log('--- 第二步：生成总结 ---');

    // ====== 第二步：按类别总结 ======
    const summarizePrompt = buildSummarizePrompt(articles, classificationResult, dateRange);
    const generatedContent = await callAI([
      { role: 'system', content: '你是一个专业的行业分析师，擅长从大量行业动态中提炼核心观点，生成高质量的行业日报。输出纯文本，不要加任何 Markdown 格式标记。' },
      { role: 'user', content: summarizePrompt },
    ], apiKey, model);

    if (!generatedContent) {
      return res.status(502).json({ error: 'AI API 返回内容为空' });
    }

    console.log(`[${new Date().toLocaleString('zh-CN')}] 生成成功，内容长度：${generatedContent.length} 字`);

    res.json({
      success: true,
      content: generatedContent,
      model,
      steps: ['classify', 'summarize'],
    });

  } catch (err) {
    console.error('请求失败:', err);
    res.status(500).json({
      error: '调用 AI API 失败',
      detail: err.message,
    });
  }
});

// ============================================================
// 两步 LLM 调用：第一步分类 → 第二步按类别总结
// ============================================================

function buildClassifyPrompt(articles) {
  const articleTexts = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.content || ''}`)
    .join('\n\n');

  return `你是行业分析师。请将以下 ${articles.length} 条动态归类到最合适的类别中。

可用类别（每条必须且只能归入一个类别）：
- 政策与监管（政策法规、标准、补贴、监管动作）
- 技术突破（技术进展、研发成果、创新产品、专利）
- 竞品/公司动态（企业战略、人事变动、合作签约、竞争格局）
- 投融资（融资、IPO、并购、投资、资本运作）
- 市场数据（销量、份额、价格、渗透率等数据发布）

输出格式（纯文本，不要 Markdown）：
政策与监管：
[序号列表]

技术突破：
[序号列表]

竞品/公司动态：
[序号列表]

投融资：
[序号列表]

市场数据：
[序号列表]
（如果某类别无内容则省略该类别标题）

原始动态：
${articleTexts}`;
}

function buildSummarizePrompt(articles, classificationResult, dateRange) {
  const articleTexts = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.content || ''}`)
    .join('\n\n');

  return `你是资深行业分析师，请根据以下已分类的行业动态，生成专业日报。

时间范围：${dateRange || '近期'}

分类结果：
${classificationResult}

原始动态：
${articleTexts}

【严格按以下格式输出，纯文本，禁止 Markdown 标记】

【行业摘要】
300字左右综合摘要，概括整体态势和核心趋势。

【行业要闻】
按以下主题归类（无内容的类别不出现），每个类别用 1-2 段话做整合性分析提炼，不要逐条罗列新闻：

政策与监管：（如有）整合该领域核心要点，包括政策动向及影响
技术突破：（如有）整合技术进展趋势及潜在影响
竞品/公司动态：（如有）概括主要玩家动作及市场格局变化
投融资：（如有）总结资本流向及信号意义
市场数据：（如有）解读关键数据背后的趋势

关键要求：
1. 每个类别是整合性分析段落（1-2段），不是逐条新闻列表
2. 提炼趋势、影响和矛盾点，体现专业洞察
3. 不要标注来源，不要"据报道""消息称"
4. 纯文本输出`;
}

async function callAI(messages, apiKey, model) {
  const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API 错误 (${response.status}): ${errorBody}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// 启动服务
// ============================================================
async function startServer() {
  await initDB();

  // 优雅关闭时保存数据库
  process.on('SIGINT', () => {
    console.log('\n正在关闭数据库...');
    saveDB();
    process.exit(0);
  });

  app.listen(PORT, () => {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    console.log('');
    console.log('========================================');
    console.log(`  行业日报生成服务已启动`);
    console.log(`  地址：http://localhost:${PORT}`);
    console.log(`  数据库：${DB_PATH}`);
    console.log(`  模型：${process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct'}`);
    console.log(`  API Key：${apiKey ? '✅ 已配置' : '❌ 未配置（请在 .env 中设置）'}`);
    console.log('========================================');
    console.log('');
  });
}

startServer().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
