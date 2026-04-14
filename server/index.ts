/**
 * 本地开发服务器（Express）
 * 用于本地开发和测试
 * 部署到 Vercel 后不再需要此文件（使用 app/api/ 下的 Serverless Functions）
 *
 * 启动方式：npx tsx server/index.ts
 * 或者：cd server && npm run dev
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入共享模块
import {
  createDatabase,
  resetDatabaseInstance,
} from './lib/db.js';

import {
  callAI,
  buildClassifyPrompt,
  buildSummarizePrompt,
} from './lib/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

let db = null;

// ============================================================
// 数据库初始化
// ============================================================
async function initDB() {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'news.db');
  db = await createDatabase(DB_PATH);
  console.log(`[服务] 数据库已初始化`);
}

// ============================================================
// 中间件
// ============================================================
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 健康检查
app.get('/', async (_req, res) => {
  const healthy = await db?.health();
  res.json({
    status: healthy ? 'ok' : 'error',
    message: '行业日报生成服务运行中',
    mode: process.env.USE_LOCAL_DB === 'true' ? 'local (SQLite)' : 'supabase',
    model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// 新闻 API（复用 Database 接口）
// ============================================================

/** GET /news - 分页列表 */
app.get('/news', async (req, res) => {
  try {
    const result = await db.getArticles({
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      keyword: req.query.keyword || '',
      mode: req.query.mode === 'exact' ? 'exact' : 'fuzzy',
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('查询新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /news/all - 全部筛选结果 */
app.get('/news/all', async (req, res) => {
  try {
    const { articles, totalFiltered } = await db.getAllArticles({
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      keyword: req.query.keyword || '',
      mode: req.query.mode === 'exact' ? 'exact' : 'fuzzy',
    });

    const MAX_ARTICLES = 100;
    res.json({
      success: true,
      data: articles,
      total: articles.length,
      totalFiltered,
      truncated: totalFiltered > MAX_ARTICLES,
      maxLimit: MAX_ARTICLES,
    });
  } catch (err: any) {
    console.error('查询全部新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /news - 批量添加 */
app.post('/news', async (req, res) => {
  try {
    const { articles } = req.body;
    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 articles 参数或为空数组' });
    }

    const result = await db.addArticles(articles.map((a: any) => ({
      id: a.id,
      source_id: a.sourceId || '',
      source_name: a.sourceName || '',
      title: a.title || '',
      summary: a.summary || '',
      url: a.url || '',
      content: a.content || '',
      published_at: a.publishedAt || new Date().toISOString(),
      fetched_at: a.fetchedAt || new Date().toISOString(),
      tags: Array.isArray(a.tags) ? a.tags : [],
    })));

    res.json({
      success: true,
      ...result,
      message: `添加成功 ${result.inserted} 条，跳过重复 ${result.skipped} 条`,
    });
  } catch (err: any) {
    console.error('添加新闻失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /news/:id - 删除单条 */
app.delete('/news/:id', async (req, res) => {
  try {
    await db.deleteArticle(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /news/cleanup?days=N - 清理过期数据 */
app.delete('/news/cleanup', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 180;
    const deleted = await db.cleanupOlderThan(days);
    res.json({ success: true, deleted, message: `已清理 ${deleted} 条 ${days} 天前的新闻` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 日报生成接口（两步 LLM 调用）
// ============================================================

app.post('/generate', async (req, res) => {
  const { articles, dateRange } = req.body;

  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: '缺少 articles 参数，或 articles 为空数组' });
  }

  try {
    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到请求：${articles.length} 条动态，日期：${dateRange}`);
    console.log('--- 第一步：分类 ---');

    // 第一步：分类
    const classifyPrompt = buildClassifyPrompt(articles);
    const classificationResult = await callAI([
      { role: 'system', content: '你是专业的行业信息分类员。输出纯文本，不要 Markdown 格式标记。' },
      { role: 'user', content: classifyPrompt },
    ]);

    console.log(`分类完成，结果长度：${classificationResult.length} 字`);
    console.log('--- 第二步：生成总结 ---');

    // 第二步：按类别总结
    const summarizePrompt = buildSummarizePrompt(articles, classificationResult, dateRange);
    const generatedContent = await callAI([
      {
        role: 'system',
        content: '你是一个专业的行业分析师，擅长从大量行业动态中提炼核心观点，生成高质量的行业日报。输出纯文本，不要加任何 Markdown 格式标记。',
      },
      { role: 'user', content: summarizePrompt },
    ]);

    if (!generatedContent) {
      return res.status(502).json({ error: 'AI API 返回内容为空' });
    }

    console.log(`[${new Date().toLocaleString('zh-CN')}] 生成成功，内容长度：${generatedContent.length} 字`);

    res.json({
      success: true,
      content: generatedContent,
      model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
      steps: ['classify', 'summarize'],
    });
  } catch (err: any) {
    console.error('请求失败:', err);
    res.status(500).json({
      error: '调用 AI API 失败',
      detail: err.message,
    });
  }
});

// ============================================================
// 启动
// ============================================================
async function startServer() {
  await initDB();

  process.on('SIGINT', () => {
    console.log('\n正在关闭...');
    process.exit(0);
  });

  app.listen(PORT, () => {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    console.log('');
    console.log('========================================');
    console.log(`  行业日报生成服务已启动`);
    console.log(`  地址：http://localhost:${PORT}`);
    console.log(`  模式：${process.env.USE_LOCAL_DB !== 'false' ? 'SQLite（本地）' : 'Supabase（生产）'}`);
    console.log(`  AI 模型：${process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct'}`);
    console.log(`  API Key：${apiKey ? '✅ 已配置' : '❌ 未配置（请在 .env 中设置）'}`);
    console.log('========================================');
    console.log('');
    console.log('提示：前端运行在 http://localhost:5173');
    console.log('      Vercel 部署后使用 /api/* 端点');
  });
}

startServer().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
