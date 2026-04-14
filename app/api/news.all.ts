/**
 * Vercel Serverless Function: GET /api/news/all
 * 获取全部筛选结果（日报生成用，不分页）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDatabase } from '../../server/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: '仅支持 GET 请求' });
  }

  try {
    const db = await createDatabase();
    const { articles, totalFiltered } = await db.getAllArticles({
      dateFrom: req.query.dateFrom as string || '',
      dateTo: req.query.dateTo as string || '',
      keyword: req.query.keyword as string || '',
      mode: (req.query.mode as any) || 'fuzzy',
    });

    const MAX_ARTICLES = 100;
    const truncated = totalFiltered > MAX_ARTICLES;

    return res.json({
      success: true,
      data: articles,
      total: articles.length,
      totalFiltered,
      truncated,
      maxLimit: MAX_ARTICLES,
    });
  } catch (error: any) {
    console.error('查询全部新闻失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
    });
  }
}
